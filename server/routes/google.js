/**
 * Rotas da integração Google Agenda/Meet.
 *
 * - Fluxo OAuth do profissional (connect/callback/status/disconnect).
 * - Webhook público de push (notifications) que o Google chama em mudanças.
 */

import express from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import {
  isGoogleConfigured,
  getAuthUrl,
  verifyState,
  exchangeCodeAndStore,
  getStatus,
  disconnect,
  startWatch,
  findProfessionalByChannel,
  verifyState as verifyChannelToken,
} from "../utils/googleCalendar.js";
import { pullGoogleChanges } from "../utils/googleInbound.js";

const router = express.Router();

function frontendBaseUrl() {
  const isProduction = process.env.NODE_ENV === "production";
  return (
    process.env.FRONTEND_URL ||
    (isProduction ? "https://www.cartaoquiroferreira.com.br" : "http://localhost:5173")
  );
}

// Inicia o OAuth: o profissional logado conecta o próprio Google Agenda.
router.get("/connect", authenticate, authorize(["professional"]), (req, res) => {
  if (!isGoogleConfigured()) {
    return res.status(503).json({ message: "Integração Google não configurada no servidor." });
  }
  try {
    const url = getAuthUrl(req.user.id);
    res.json({ url });
  } catch (error) {
    console.error("❌ [google-connect]", error);
    res.status(500).json({ message: "Erro ao iniciar conexão com o Google." });
  }
});

// Callback do Google: troca o code, armazena o token, inicia watch + sync.
router.get("/callback", async (req, res) => {
  const base = frontendBaseUrl();
  const { code, state, error } = req.query;
  if (error || !code || !state) {
    return res.redirect(`${base}/professional/profile?google=erro`);
  }
  const professionalId = verifyState(String(state));
  if (!professionalId) {
    return res.redirect(`${base}/professional/profile?google=erro`);
  }
  try {
    await exchangeCodeAndStore(String(code), professionalId);
    // Best-effort: registra push e faz sync inicial sem bloquear o redirect.
    startWatch(professionalId)
      .then(() => pullGoogleChanges(professionalId))
      .catch((e) => console.error("❌ [google-callback-watch]", e));
    res.redirect(`${base}/professional/profile?google=ok`);
  } catch (e) {
    console.error("❌ [google-callback]", e);
    res.redirect(`${base}/professional/profile?google=erro`);
  }
});

// Status da conexão do profissional logado.
router.get("/status", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    res.json(await getStatus(req.user.id));
  } catch (error) {
    console.error("❌ [google-status]", error);
    res.status(500).json({ message: "Erro ao consultar status do Google." });
  }
});

// Desconecta: para o watch, revoga e remove a credencial.
router.post("/disconnect", authenticate, authorize(["professional"]), async (req, res) => {
  try {
    await disconnect(req.user.id);
    res.json({ ok: true });
  } catch (error) {
    console.error("❌ [google-disconnect]", error);
    res.status(500).json({ message: "Erro ao desconectar o Google." });
  }
});

// Webhook público de push (Google chama). Valida o canal e dispara o pull async.
router.post("/notifications", async (req, res) => {
  // ACK imediato — o processamento é assíncrono.
  res.sendStatus(200);
  try {
    const channelId = req.get("X-Goog-Channel-ID");
    const resourceId = req.get("X-Goog-Resource-ID");
    const resourceState = req.get("X-Goog-Resource-State");
    const channelToken = req.get("X-Goog-Channel-Token");
    if (!channelId || !resourceId) return;
    if (resourceState === "sync") return; // handshake inicial do canal

    const professionalId = await findProfessionalByChannel(channelId, resourceId);
    if (!professionalId) return;

    // Defesa adicional: o token do canal é um JWT assinado com professionalId.
    const tokenProfId = channelToken ? verifyChannelToken(channelToken) : null;
    if (tokenProfId !== professionalId) {
      process.stderr.write("[google-notifications] token de canal inválido\n");
      return;
    }
    await pullGoogleChanges(professionalId);
  } catch (e) {
    process.stderr.write("[google-notifications] " + String(e) + "\n");
  }
});

export default router;
