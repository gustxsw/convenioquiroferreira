/**
 * Adaptador WhatsApp via Baileys (biblioteca não-oficial) — Secretária Virtual.
 *
 * Usado como ALTERNATIVA à Meta Cloud API para testes/homologação. Ativado por
 * WHATSAPP_PROVIDER=baileys. Conecta a um número real escaneando o QR uma única
 * vez (a sessão fica persistida em disco), recebe mensagens de pacientes e as
 * repassa para o núcleo do bot (`processInbound` de server/whatsapp.js), e envia
 * respostas pelo próprio socket.
 *
 * Mantém a mesma "forma" de dados que o webhook da Meta: cada mensagem de entrada
 * vira uma chamada a processInbound({ phone, messageId, type, textBody,
 * phoneNumberId, displayNumber }). Aqui phoneNumberId é null e displayNumber é o
 * próprio número conectado (o bot) — é ele que o mapa WHATSAPP_NUMBERS usa para
 * resolver o profissional dono da linha.
 */

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import qrimage from "qrcode";
import { processInbound } from "../whatsapp.js";
import { uploadWhatsappMedia } from "./whatsappMedia.js";
import {
  usePostgresAuthState,
  clearAuthState,
  hasStoredSession,
  DEFAULT_SESSION_ID,
} from "./baileysAuthState.js";

let sock = null;
let botNumber = null; // dígitos do número conectado (ex.: "5564999876597")
let starting = false;

// Estado observável pelo painel admin (GET /api/admin/whatsapp/connection).
// O QR fica só em memória como data URL: é efêmero (expira em ~60s) e não deve
// ser persistido — quem tiver o QR pareia o número.
let currentQrDataUrl = null;
let currentQrAt = null;
let lastStatus = "disconnected"; // disconnected | connecting | qr | connected
let lastError = null;
let connectedAt = null;

function setStatus(status, { error = null } = {}) {
  lastStatus = status;
  lastError = error;
  if (status !== "qr") {
    currentQrDataUrl = null;
    currentQrAt = null;
  }
}

// Mapa telefone(identidade) -> JID real de resposta. O WhatsApp entrega muitas
// conversas via LID (@lid, endereçamento de privacidade); responder ao número
// reconstruído em @s.whatsapp.net falha. Guardamos aqui o JID exato de onde a
// mensagem veio (preservando @lid) para responder no mesmo endereço.
const replyJidByPhone = new Map();

function log(event, data = {}) {
  try {
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), src: "baileys", event, ...data }) + "\n"
    );
  } catch {
    /* nunca deixar o log quebrar o fluxo */
  }
}

function onlyDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

// Extrai o número (dígitos) de um JID: "5564999876597@s.whatsapp.net" -> "5564999876597".
function jidToDigits(jid) {
  return onlyDigits(String(jid || "").split("@")[0].split(":")[0]);
}

// Normaliza um JID removendo o sufixo de dispositivo/agent, preservando o domínio:
// "81956750553140:31@lid" -> "81956750553140@lid";
// "5564...:0@s.whatsapp.net" -> "5564...@s.whatsapp.net".
function normalizeJid(jid) {
  const s = String(jid || "");
  const at = s.indexOf("@");
  if (at === -1) return s;
  const user = s.slice(0, at).split(":")[0];
  const domain = s.slice(at + 1);
  return `${user}@${domain}`;
}

// Detecta mídia numa mensagem Baileys → { mediaType, mime } ou null.
function detectMedia(message) {
  const m = message?.ephemeralMessage?.message || message || {};
  if (m.imageMessage) return { mediaType: "image", mime: m.imageMessage.mimetype || "image/jpeg" };
  if (m.audioMessage) return { mediaType: "audio", mime: m.audioMessage.mimetype || "audio/ogg" };
  if (m.videoMessage) return { mediaType: "video", mime: m.videoMessage.mimetype || "video/mp4" };
  if (m.documentMessage) return { mediaType: "document", mime: m.documentMessage.mimetype || "application/octet-stream" };
  if (m.stickerMessage) return { mediaType: "sticker", mime: m.stickerMessage.mimetype || "image/webp" };
  return null;
}

// Texto de uma mensagem Baileys (cobre os tipos de texto mais comuns).
function extractText(message) {
  if (!message) return "";
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.ephemeralMessage?.message?.conversation ||
    message.ephemeralMessage?.message?.extendedTextMessage?.text ||
    ""
  );
}

/**
 * Inicia (ou reinicia) a conexão Baileys. Idempotente: chamadas concorrentes ou
 * repetidas são ignoradas enquanto já há um socket ativo/conectando.
 */
export async function startBaileys() {
  if (sock || starting) {
    log("already_running", {});
    return;
  }
  starting = true;
  setStatus("connecting");

  try {
    const { state, saveCreds } = await usePostgresAuthState();
    const { version } = await fetchLatestBaileysVersion();
    log("connecting", { version, sessionId: DEFAULT_SESSION_ID });

    sock = makeWASocket({
      version,
      auth: state,
      // Não imprimimos o QR pelo Baileys; usamos qrcode-terminal em connection.update.
      printQRInTerminal: false,
      // Não marca como visto automaticamente; a Secretária responde por texto.
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        // Terminal: útil em dev. Painel admin: data URL, único caminho viável
        // num servidor headless como o Render.
        process.stdout.write(
          "\n📲 Escaneie o QR abaixo no WhatsApp do número da Secretária Virtual\n" +
            "   (Aparelhos conectados → Conectar um aparelho):\n\n"
        );
        qrcode.generate(qr, { small: true });
        qrimage
          .toDataURL(qr, { width: 480, margin: 2 })
          .then((dataUrl) => {
            currentQrDataUrl = dataUrl;
            currentQrAt = Date.now();
            lastStatus = "qr";
            log("qr_ready", {});
          })
          .catch((e) => log("qr_encode_error", { error: String(e) }));
      }

      if (connection === "open") {
        botNumber = jidToDigits(sock?.user?.id);
        connectedAt = Date.now();
        setStatus("connected");
        log("connected", { botNumber });
        process.stdout.write(`\n✅ Baileys conectado como ${botNumber}\n`);
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        log("disconnected", { statusCode, loggedOut });
        sock = null;
        starting = false;
        botNumber = null;
        connectedAt = null;
        setStatus("disconnected", { error: statusCode ? `statusCode ${statusCode}` : null });

        if (loggedOut) {
          // Credenciais invalidadas pelo WhatsApp: limpa a sessão do banco e sobe
          // de novo já pedindo QR — o admin repareia pelo painel, sem SSH.
          process.stdout.write(
            "\n⚠️  Sessão do WhatsApp encerrada (logout). Gerando novo QR — " +
              "escaneie pelo painel admin (Números da Secretária).\n"
          );
          clearAuthState()
            .catch((e) => log("clear_auth_error", { error: String(e) }))
            .finally(() => {
              setTimeout(() => {
                startBaileys().catch((e) => log("relogin_error", { error: String(e) }));
              }, 2000);
            });
          return;
        }
        // Qualquer outra queda: tenta reconectar.
        setTimeout(() => {
          startBaileys().catch((e) => log("reconnect_error", { error: String(e) }));
        }, 3000);
      }
    });

    sock.ev.on("messages.upsert", async (up) => {
      // "notify" = mensagens novas em tempo real (ignora sincronização de histórico).
      if (up.type !== "notify") return;
      for (const m of up.messages || []) {
        try {
          await handleIncoming(m);
        } catch (e) {
          log("incoming_error", { error: String(e), stack: e?.stack });
        }
      }
    });

    starting = false;
  } catch (e) {
    starting = false;
    sock = null;
    log("start_error", { error: String(e), stack: e?.stack });
    throw e;
  }
}

// Resolve o telefone real (PN) de uma mensagem. Conversas via LID trazem só um id
// de privacidade; o número vem em key.remoteJidAlt ou pelo mapeamento LID->PN do
// Baileys. Se não der para resolver, devolve null (o chamador usa o LID como
// identidade — a entrega ainda funciona respondendo ao próprio JID de origem).
async function resolvePhoneNumberJid(key) {
  const remoteJid = key.remoteJid || "";
  if (remoteJid.endsWith("@s.whatsapp.net")) return remoteJid;
  if (remoteJid.endsWith("@lid")) {
    if (key.remoteJidAlt && key.remoteJidAlt.endsWith("@s.whatsapp.net")) {
      return key.remoteJidAlt;
    }
    try {
      const pn = await sock?.signalRepository?.lidMapping?.getPNForLID?.(remoteJid);
      if (pn) return pn;
    } catch (e) {
      log("lid_resolve_error", { error: String(e) });
    }
  }
  return null;
}

async function handleIncoming(m) {
  const key = m.key || {};
  if (key.fromMe) return; // ignora o que o próprio bot/atendente enviou
  const remoteJid = key.remoteJid || "";
  if (remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") return; // grupos/status: ignora

  // Identidade: preferimos o telefone real; se vier só o LID, ele mesmo é a chave.
  const pnJid = await resolvePhoneNumberJid(key);
  const phone = jidToDigits(pnJid || remoteJid);
  if (!phone) return;

  // Responde SEMPRE ao JID de onde a mensagem veio (preserva @lid) — garante entrega.
  replyJidByPhone.set(phone, normalizeJid(remoteJid));

  const rawText = extractText(m.message);

  // Mídia (áudio/imagem/documento): baixa e sobe pro Cloudinary, pra o operador
  // ouvir/abrir no painel. O bot em si ainda só age sobre texto, mas a mídia fica
  // registrada na conversa (com a legenda, se houver).
  const media = detectMedia(m.message);
  let mediaUrl = null;
  let mediaMime = null;
  const mediaType = media?.mediaType || null;
  if (media) {
    mediaMime = media.mime;
    try {
      const buffer = await downloadMediaMessage(
        m, "buffer", {}, { reuploadRequest: sock.updateMediaMessage }
      );
      mediaUrl = await uploadWhatsappMedia(buffer, { mediaType, mime: mediaMime });
      log("media_saved", { phone, mediaType, saved: !!mediaUrl });
    } catch (e) {
      log("media_download_error", { error: String(e) });
    }
  }

  const type = rawText ? "text" : (mediaType || Object.keys(m.message || {})[0] || "unknown");

  log("inbound", { phone, jid: remoteJid, resolvedPn: !!pnJid, messageId: key.id, type, hasMedia: !!mediaUrl });

  await processInbound({
    phone,
    messageId: key.id,
    type, // sem texto (áudio/imagem sem legenda) → o núcleo pede texto; a mídia fica logada
    textBody: rawText,
    phoneNumberId: null,
    // O número conectado é a "linha do profissional": WHATSAPP_NUMBERS o mapeia.
    displayNumber: botNumber || process.env.WHATSAPP_BOT_NUMBER || null,
    mediaUrl,
    mediaMime,
    mediaType,
  });
}

/**
 * Envia texto pelo socket Baileys. Assinatura e retorno compatíveis com
 * sendWhatsappTextMessage (Cloud API): retorna { messages: [{ id }] }.
 */
export async function sendBaileysText({ toDigits, text }) {
  if (!sock) throw new Error("Baileys não está conectado.");
  const digits = onlyDigits(toDigits);
  // Usa o JID real da conversa (pode ser @lid); só cai no s.whatsapp.net (envio
  // proativo, sem conversa prévia mapeada) quando não há JID registrado.
  const jid = replyJidByPhone.get(digits) || `${digits}@s.whatsapp.net`;
  const res = await sock.sendMessage(jid, { text: String(text).slice(0, 4096) });
  return { messages: [{ id: res?.key?.id || null }] };
}

export function isBaileysConnected() {
  return !!sock;
}

/**
 * Estado da conexão para o painel admin. O QR só é devolvido enquanto está
 * válido (o WhatsApp o rotaciona a cada ~60s; devolvemos até 90s por margem).
 */
export async function getConnectionState() {
  const qrFresh = currentQrDataUrl && Date.now() - (currentQrAt || 0) < 90_000;
  let hasSession = false;
  try {
    hasSession = await hasStoredSession();
  } catch {
    /* banco indisponível não pode derrubar a rota de status */
  }
  return {
    provider: (process.env.WHATSAPP_PROVIDER || "").toLowerCase() || "cloud",
    sessionId: DEFAULT_SESSION_ID,
    status: lastStatus,
    connected: !!sock && lastStatus === "connected",
    botNumber,
    connectedAt: connectedAt ? new Date(connectedAt).toISOString() : null,
    hasStoredSession: hasSession,
    qr: qrFresh ? currentQrDataUrl : null,
    qrAt: qrFresh ? new Date(currentQrAt).toISOString() : null,
    lastError,
  };
}

/** Derruba o socket atual e reconecta reaproveitando a sessão salva. */
export async function restartBaileys() {
  try {
    sock?.end?.(new Error("restart solicitado pelo painel"));
  } catch {
    /* já caiu */
  }
  sock = null;
  starting = false;
  setStatus("connecting");
  await startBaileys();
}

/**
 * Desconecta o número e apaga a sessão do banco, forçando um novo QR — usado
 * para trocar o número da secretária pelo painel.
 */
export async function logoutBaileys() {
  try {
    await sock?.logout?.();
  } catch (e) {
    log("logout_error", { error: String(e) });
  }
  try {
    sock?.end?.(new Error("logout solicitado pelo painel"));
  } catch {
    /* já caiu */
  }
  sock = null;
  starting = false;
  botNumber = null;
  connectedAt = null;
  await clearAuthState();
  setStatus("disconnected");
  // Sobe de novo para já apresentar o QR do próximo número.
  await startBaileys();
}
