/**
 * Secretária Virtual via WhatsApp (Meta Cloud API) — uma por profissional.
 *
 * Multi-número: cada profissional tem seu próprio número, e a secretária se
 * apresenta como secretária DELE (não do convênio). O Convênio Quiro Ferreira
 * é assunto secundário que ela também sabe responder.
 *
 * Recebe mensagens de pacientes, identifica a intenção por palavra-chave e
 * agenda/remarca/cancela consultas acessando o banco diretamente pelo `pool`
 * (o bot não tem sessão JWT). Dúvidas sobre o convênio usam a API Anthropic.
 *
 * Robustez para produção:
 * - Log completo de mensagens (entrada/saída) em `whatsapp_messages`.
 * - Idempotência por `message_id` (rejeita reentregas da Meta).
 * - Sessão persistida em `whatsapp_sessions` (TTL 15 min), sem Redis.
 * - Auditoria de ações em `whatsapp_audit_log`, identificando o ator
 *   (patient | ai | human).
 * - Handoff: um operador humano pode assumir a conversa (bot silencia).
 */

import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import {
  getWorkingHours,
  isWithinWorkingHours,
  getAvailableDays,
  getFreeSlotsForDay,
} from "./utils/agenda.js";
import {
  formatToBrazilDate,
  formatToBrazilTimeOnly,
} from "./utils/dateHelpers.js";
import { sendWhatsappTextMessage } from "./utils/whatsappCloud.js";
import { sendBaileysText } from "./utils/whatsappBaileys.js";
import {
  syncCreateEvent,
  syncUpdateEvent,
  syncCancelEvent,
} from "./utils/consultationSync.js";

const SESSION_TTL_MINUTES = 15;

// Persona da secretária, personalizada por profissional (multi-número): cada
// profissional tem seu próprio número, então a IA se apresenta como secretária
// DELE. O Convênio Quiro Ferreira é um assunto secundário que ela também domina.
function buildSystemPrompt(professionalName) {
  const prof = String(professionalName || "").trim() || "seu profissional de saúde";
  return `Você é a secretária virtual de ${prof}.
Seu papel principal é atender os pacientes de ${prof}: agendar, remarcar e cancelar
consultas e tirar dúvidas sobre o atendimento. Fale sempre em nome de ${prof},
nunca se apresente como secretária de um convênio ou da plataforma.

${prof} atende pelo Convênio Quiro Ferreira, então você também pode tirar dúvidas
sobre o convênio de forma clara e direta, sem enrolação.

Informações do Convênio Quiro Ferreira:
- Plano anual: R$ 600,00
- Benefícios: consultas com desconto, prioridade no agendamento, possibilidade de adicionar dependentes
- Acesso ao painel: cartaoquiroferreira.com.br — login com CPF e senha
- Especialidades disponíveis: conforme profissionais ativos no sistema

Quando o paciente quiser contratar o convênio:
1. Peça o CPF
2. Se não encontrar cadastro: colete nome e telefone
3. Informe que o link de pagamento será enviado em seguida
4. Encerre com: "Após a confirmação do pagamento você recebe o acesso ao painel."

Nunca invente informações. Se não souber algo, diga que vai verificar e que em breve retorna.

Tom de voz: acolhedor, próximo e humano — como uma secretária simpática que conhece o paciente.
Fale de forma natural (pode usar "você", contrações e no máximo 1 emoji quando fizer sentido),
evitando soar robótica ou formal demais. Seja breve: no máximo 3 parágrafos curtos por resposta.`;
}

// ===== LOG ESTRUTURADO (imune ao silenciamento de console.* em produção) =====

function botLog(event, data = {}) {
  try {
    process.stdout.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        src: "whatsapp",
        event,
        ...data,
      }) + "\n"
    );
  } catch {
    /* nunca deixar o log quebrar o fluxo */
  }
}

// ===== UTILITÁRIOS =====

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function onlyDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

function isYes(t) {
  const n = normalize(t);
  return (
    ["sim", "s", "quero", "pode", "confirmo", "confirmar", "isso", "ok", "claro"].includes(n) ||
    n.startsWith("sim")
  );
}

function isNo(t) {
  const n = normalize(t);
  return ["nao", "n", "negativo", "nops"].includes(n) || n.startsWith("nao");
}

// Primeiro nome, com inicial maiúscula — para deixar as mensagens mais pessoais.
function firstName(fullName) {
  const first = String(fullName || "").trim().split(/\s+/)[0] || "";
  if (!first) return "";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// Prefixo de saudação pessoal: "Ana, " quando conhecemos o nome; "" caso contrário.
function personal(session) {
  const n = firstName(session?.pacienteNome);
  return n ? `${n}, ` : "";
}

function newSession() {
  return { step: null, mode: "bot" };
}

function resetFlow(session) {
  session.step = null;
  session.intent = null;
  session.flow = null;
  session.cpf = null;
  session.pacienteId = null;
  session.pacienteNome = null;
  session.consultaId = null;
  session.days = null;
  session.chosenDay = null;
  session.slots = null;
  session.professionals = null;
  session.serviceId = null;
  session.serviceValue = null;
  // Perfil/particular e contexto da IA não persistem entre fluxos.
  session.patientKind = null;
  session.privatePatientId = null;
  session.priceProfile = null;
  session.newPatientKind = null;
  session.convenioHistory = null;
  // Profissional volta a ser o do número (multi-número); se não houver, limpa.
  session.profissionalId = session.profFromNumber || null;
}

// ===== DETECÇÃO DE INTENÇÃO (palavra-chave, sem IA) =====

const INTENT_KEYWORDS = [
  // Ordem importa: CANCELAR/REAGENDAR/CONVENIO antes de AGENDAR para que
  // "cancelar consulta" ou "remarcar" não caiam em AGENDAR (que casa "consulta").
  ["CANCELAR", ["cancelar", "desmarcar", "cancelar consulta", "nao vou poder ir", "nao consigo ir"]],
  ["REAGENDAR", ["remarcar", "reagendar", "mudar horario", "trocar horario", "mudar data"]],
  ["CONVENIO", ["convenio", "carteirinha", "cobertura", "preco", "valor", "como funciona", "quanto custa", "plano", "beneficio", "contratar", "quero contratar"]],
  ["AGENDAR", ["agendar", "marcar", "marcacao", "consulta", "quero consulta", "queria agendar", "preciso de uma consulta", "nova consulta"]],
];

function detectIntent(text) {
  const n = normalize(text);
  for (const [intent, words] of INTENT_KEYWORDS) {
    if (words.some((w) => n.includes(w))) return intent;
  }
  return "SAUDACAO";
}

// ===== PERSISTÊNCIA: MENSAGENS, SESSÃO, AUDITORIA =====

// INSERT inbound com idempotência. Retorna true se a mensagem é nova.
async function recordInbound({ phone, messageId, text, intent = null, step = null, professionalId = null }) {
  const r = await pool.query(
    `INSERT INTO whatsapp_messages (phone, message_id, direction, actor, intent, step, text, professional_id)
     VALUES ($1, $2, 'inbound', 'patient', $3, $4, $5, $6)
     ON CONFLICT (message_id) DO NOTHING
     RETURNING id`,
    [phone, messageId || null, intent, step, text || null, professionalId]
  );
  return r.rows.length > 0;
}

async function logOutbound({ phone, text, actor = "ai", actorId = null, intent = null, step = null, messageId = null, professionalId = null }) {
  try {
    await pool.query(
      `INSERT INTO whatsapp_messages (phone, message_id, direction, actor, actor_id, intent, step, text, professional_id)
       VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7, $8)`,
      [phone, messageId, actor, actorId, intent, step, text, professionalId]
    );
  } catch (e) {
    botLog("log_outbound_error", { error: String(e) });
  }
}

async function audit({ phone, actor, actorId = null, action, detail = null, professionalId = null }) {
  try {
    await pool.query(
      `INSERT INTO whatsapp_audit_log (phone, actor, actor_id, action, detail, professional_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [phone, actor, actorId, action, detail ? JSON.stringify(detail) : null, professionalId]
    );
  } catch (e) {
    botLog("audit_error", { error: String(e) });
  }
}

// Registra o uso da IA (tokens) para o relatório de custo (Seção 7).
async function recordAiUsage({ phone, professionalId = null, usage, model }) {
  try {
    if (!usage) return;
    await pool.query(
      `INSERT INTO whatsapp_ai_usage (phone, professional_id, input_tokens, output_tokens, model)
       VALUES ($1, $2, $3, $4, $5)`,
      [phone, professionalId, usage.input_tokens || 0, usage.output_tokens || 0, model || null]
    );
  } catch (e) {
    botLog("ai_usage_error", { error: String(e) });
  }
}

async function loadSession(phone) {
  const r = await pool.query(
    `SELECT session FROM whatsapp_sessions
       WHERE phone = $1 AND updated_at > NOW() - ($2 * INTERVAL '1 minute')`,
    [phone, SESSION_TTL_MINUTES]
  );
  return r.rows[0]?.session || null;
}

// Carrega ignorando o TTL — usado por ações de operador (handoff).
async function loadSessionRaw(phone) {
  const r = await pool.query(
    "SELECT session FROM whatsapp_sessions WHERE phone = $1",
    [phone]
  );
  return r.rows[0]?.session || null;
}

async function saveSession(phone, session) {
  await pool.query(
    `INSERT INTO whatsapp_sessions (phone, session, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (phone) DO UPDATE SET session = $2, updated_at = NOW()`,
    [phone, JSON.stringify(session)]
  );
}

// ===== ENVIO + LOG =====

// Envio de texto agnóstico ao transporte. WHATSAPP_PROVIDER=baileys usa a
// biblioteca não-oficial (testes); qualquer outro valor usa a Meta Cloud API.
async function sendText({ toDigits, text, phoneNumberId }) {
  const provider = (process.env.WHATSAPP_PROVIDER || "cloud").toLowerCase();
  if (provider === "baileys") {
    return sendBaileysText({ toDigits, text });
  }
  return sendWhatsappTextMessage({ toDigits, text, phoneNumberId });
}

async function reply(phone, text, { phoneNumberId, intent = null, step = null, professionalId = null } = {}) {
  let messageId = null;
  try {
    const resp = await sendText({ toDigits: phone, text, phoneNumberId });
    messageId = resp?.messages?.[0]?.id || null;
  } catch (e) {
    botLog("send_error", { phone, error: String(e) });
  }
  await logOutbound({ phone, text, actor: "ai", intent, step, messageId, professionalId });
  await audit({ phone, actor: "ai", action: "message_out", detail: { step }, professionalId });
}

// Envia usando o contexto da sessão (phoneNumberId/intent/step atuais).
async function replyS(session, phone, text) {
  await reply(phone, text, {
    phoneNumberId: session.phoneNumberId,
    intent: session.intent,
    step: session.step,
    professionalId: session.profissionalId || null,
  });
}

// ===== RESOLUÇÃO DE PROFISSIONAL POR NÚMERO (multi-número) =====

function getNumbersMap() {
  try {
    return JSON.parse(process.env.WHATSAPP_NUMBERS || "{}");
  } catch {
    return {};
  }
}

function resolveProfessionalFromNumber(phoneNumberId, displayNumber) {
  const map = getNumbersMap();
  const byId = phoneNumberId != null ? map[String(phoneNumberId)] : undefined;
  const byNumber = displayNumber != null ? map[onlyDigits(displayNumber)] : undefined;
  const val = byId ?? byNumber;
  return val != null ? Number(val) : null;
}

// ===== HELPERS DE BANCO =====

async function findClientByCpf(cpf) {
  const r = await pool.query(
    "SELECT id, name FROM users WHERE cpf = $1 AND 'client' = ANY(roles) LIMIT 1",
    [cpf]
  );
  return r.rows[0] || null;
}

async function createClient({ name, phone, cpf }) {
  const hash = await bcrypt.hash(cpf, 10);
  const r = await pool.query(
    `INSERT INTO users (name, cpf, phone, password, roles)
     VALUES ($1, $2, $3, $4, ARRAY['client'])
     RETURNING id, name`,
    [name, cpf, onlyDigits(phone), hash]
  );
  return r.rows[0];
}

// Cadastra um paciente PARTICULAR do profissional, sem acesso ao painel (sem senha).
async function createPrivatePatient({ name, phone, cpf, professionalId }) {
  const r = await pool.query(
    `INSERT INTO private_patients (professional_id, name, cpf, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name`,
    [professionalId, name, cpf, onlyDigits(phone)]
  );
  return r.rows[0];
}

// Identifica o perfil do paciente pelo CPF, escopado ao profissional do número atual.
//   users + assinatura ativa  -> conveniado (preço conveniado, agenda via user_id)
//   users + assinatura inativa -> particular (preço particular, agenda via user_id)
//   private_patients do prof.  -> particular (preço particular, agenda via private_patient_id)
//   não encontrado             -> null (bot pergunta convênio ou particular)
async function identifyPatient(cpf, professionalId) {
  const u = await pool.query(
    "SELECT id, name, subscription_status FROM users WHERE cpf = $1 AND 'client' = ANY(roles) LIMIT 1",
    [cpf]
  );
  if (u.rows[0]) {
    const row = u.rows[0];
    return {
      kind: "user",
      userId: row.id,
      name: row.name,
      profile: row.subscription_status === "active" ? "convenio" : "particular",
    };
  }
  if (professionalId) {
    const p = await pool.query(
      `SELECT id, name FROM private_patients
        WHERE cpf = $1 AND professional_id = $2 AND is_active = true
        ORDER BY id ASC LIMIT 1`,
      [cpf, professionalId]
    );
    if (p.rows[0]) {
      return { kind: "private", privatePatientId: p.rows[0].id, name: p.rows[0].name, profile: "particular" };
    }
  }
  return null;
}

async function getProfessionalsWithBaseService() {
  const r = await pool.query(
    `SELECT u.id, u.name
       FROM users u
      WHERE 'professional' = ANY(u.roles)
        AND EXISTS (SELECT 1 FROM services s WHERE s.professional_id = u.id)
      ORDER BY u.name`
  );
  return r.rows;
}

async function getProfessionalName(professionalId) {
  const r = await pool.query("SELECT name FROM users WHERE id = $1", [professionalId]);
  return r.rows[0]?.name || "profissional";
}

// Nome do profissional dono do número, para personalizar a persona da secretária.
// Cacheado na sessão para evitar uma consulta a cada mensagem. Retorna null quando
// o número não está mapeado a um profissional (WHATSAPP_NUMBERS).
async function professionalDisplayName(session) {
  if (!session?.profissionalId) return null;
  if (session._profName) return session._profName;
  const name = await getProfessionalName(session.profissionalId);
  session._profName = name;
  return name;
}

// Serviço base do profissional (is_base_service tem prioridade) e seu valor por perfil.
//   convenio  -> price_member ?? base_price
//   particular -> price_private ?? base_price
async function getBaseService(professionalId, priceProfile = "convenio") {
  const r = await pool.query(
    `SELECT id AS service_id, base_price, price_member, price_private,
            COALESCE(is_online, false) AS is_online
       FROM services
      WHERE professional_id = $1
      ORDER BY is_base_service DESC NULLS LAST, id ASC
      LIMIT 1`,
    [professionalId]
  );
  const s = r.rows[0];
  if (!s) return null;
  const value =
    priceProfile === "convenio"
      ? s.price_member ?? s.base_price
      : s.price_private ?? s.base_price;
  return { service_id: s.service_id, value, isOnline: s.is_online };
}

// Próxima consulta futura ativa do paciente — por user_id (conveniado) ou
// private_patient_id (particular).
async function getNextActiveConsultation({ userId = null, privatePatientId = null }) {
  const column = privatePatientId != null ? "private_patient_id" : "user_id";
  const id = privatePatientId != null ? privatePatientId : userId;
  const r = await pool.query(
    `SELECT c.id, c.date, c.professional_id, u.name AS professional_name
       FROM consultations c
       JOIN users u ON c.professional_id = u.id
      WHERE c.${column} = $1 AND c.status != 'cancelled' AND c.date >= NOW()
      ORDER BY c.date ASC
      LIMIT 1`,
    [id]
  );
  return r.rows[0] || null;
}

// Replica a validação de expediente/conflito do POST /api/consultations.
async function createConsultation({ professionalId, userId, privatePatientId, serviceId, value, isoUTC }) {
  const working = await getWorkingHours(professionalId);
  if (!isWithinWorkingHours(isoUTC, working)) {
    return { ok: false, message: "Esse horário está fora do expediente. Escolha outro, por favor." };
  }
  const conflict = await pool.query(
    `SELECT id FROM consultations
      WHERE professional_id = $1 AND date = $2::timestamptz AND status != 'cancelled'`,
    [professionalId, isoUTC]
  );
  if (conflict.rows.length > 0) {
    return { ok: false, message: "Esse horário acabou de ser ocupado. Escolha outro, por favor." };
  }
  // CHECK no banco exige exatamente um entre user_id / dependent_id / private_patient_id.
  const r = await pool.query(
    `INSERT INTO consultations (user_id, private_patient_id, professional_id, service_id, value, date, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
     RETURNING id`,
    [userId || null, privatePatientId || null, professionalId, serviceId, value, isoUTC]
  );
  return { ok: true, id: r.rows[0].id };
}

async function rescheduleConsultation(consultationId, isoUTC, professionalId) {
  const working = await getWorkingHours(professionalId);
  if (!isWithinWorkingHours(isoUTC, working)) {
    return { ok: false, message: "Esse horário está fora do expediente. Escolha outro, por favor." };
  }
  const conflict = await pool.query(
    `SELECT id FROM consultations
      WHERE professional_id = $1 AND date = $2::timestamptz
        AND status != 'cancelled' AND id != $3`,
    [professionalId, isoUTC, consultationId]
  );
  if (conflict.rows.length > 0) {
    return { ok: false, message: "Esse horário acabou de ser ocupado. Escolha outro, por favor." };
  }
  const r = await pool.query(
    `UPDATE consultations
        SET date = $1::timestamptz, updated_at = NOW()
      WHERE id = $2 AND professional_id = $3 AND status != 'cancelled'
      RETURNING id`,
    [isoUTC, consultationId, professionalId]
  );
  return r.rows.length > 0
    ? { ok: true }
    : { ok: false, message: "Não encontrei essa consulta para remarcar." };
}

async function cancelConsultation(consultationId) {
  const r = await pool.query(
    `UPDATE consultations
        SET status = 'cancelled', cancelled_at = NOW(),
            cancellation_reason = 'Cancelado pela Secretária Virtual (WhatsApp)',
            updated_at = NOW()
      WHERE id = $1 AND status != 'cancelled'
      RETURNING id`,
    [consultationId]
  );
  return r.rows.length > 0;
}

// ===== IA (fluxo CONVENIO) =====

const AI_MODEL = "claude-haiku-4-5-20251001";

// Retorna { text, usage, model } ou null. `usage` traz input_tokens/output_tokens
// (registrados para o relatório de custo da IA — Seção 7).
async function callAnthropic(messages, professionalName) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 512,
        system: buildSystemPrompt(professionalName),
        messages,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      botLog("anthropic_error", { status: res.status, data });
      return null;
    }
    const text = data?.content?.[0]?.text?.trim() || null;
    if (!text) return null;
    return { text, usage: data?.usage || null, model: data?.model || AI_MODEL };
  } catch (e) {
    botLog("anthropic_exception", { error: String(e) });
    return null;
  }
}

function humanFallbackText() {
  const human = onlyDigits(process.env.WHATSAPP_HUMAN_FALLBACK || "");
  return human
    ? `Essa eu prefiro não responder no chute 🙂. Nossa equipe te ajuda certinho: https://wa.me/${human}`
    : "Essa eu prefiro confirmar direitinho antes de te responder 🙂. Vou verificar e já retorno, tá?";
}

// ===== FLUXOS =====

async function startFlow(session, phone, text, intent) {
  switch (intent) {
    case "AGENDAR":
      session.flow = "agendar";
      session.step = "agendar_cpf";
      await replyS(session, phone, "Que bom que você quer marcar uma consulta! 😊 Pra começar, me confirma seu *CPF* (só os números)?");
      break;
    case "REAGENDAR":
      session.flow = "reagendar";
      session.step = "reagendar_cpf";
      await replyS(session, phone, "Sem problema, vamos achar um novo horário pra você. 🙂 Me passa seu *CPF* (só os números)?");
      break;
    case "CANCELAR":
      session.flow = "cancelar";
      session.step = "cancelar_cpf";
      await replyS(session, phone, "Tudo bem, posso cuidar disso pra você. Me informa seu *CPF* (só os números), por favor?");
      break;
    case "CONVENIO":
      session.step = "convenio_chat";
      await handleConvenioChat(session, phone, text);
      break;
    case "SAUDACAO":
    default: {
      session.step = null;
      const profNome = await professionalDisplayName(session);
      const quem = profNome
        ? `a secretária virtual de *${firstName(profNome)}*`
        : "a secretária virtual do seu atendimento";
      await replyS(
        session,
        phone,
        `Oi! 👋 Aqui é ${quem}. Fico feliz em te ajudar! Posso *marcar*, *remarcar* ou *cancelar* uma consulta, ou tirar suas dúvidas sobre o *convênio*. Como posso te ajudar hoje?`
      );
      break;
    }
  }
}

async function continueFlow(session, phone, text) {
  switch (session.step) {
    case "agendar_cpf":
      return handleAgendarCpf(session, phone, text);
    case "agendar_tipo_cadastro":
      return handleAgendarTipoCadastro(session, phone, text);
    case "agendar_cadastro_nome":
      return handleAgendarCadastroNome(session, phone, text);
    case "agendar_escolha_profissional":
      return handleAgendarEscolhaProfissional(session, phone, text);
    case "escolha_dia":
      return handleEscolhaDia(session, phone, text);
    case "escolha_hora":
      return handleEscolhaHora(session, phone, text);
    case "reagendar_cpf":
      return handleReagendarCpf(session, phone, text);
    case "reagendar_confirma":
      return handleReagendarConfirma(session, phone, text);
    case "cancelar_cpf":
      return handleCancelarCpf(session, phone, text);
    case "cancelar_confirma":
      return handleCancelarConfirma(session, phone, text);
    case "convenio_chat":
      return handleConvenioChat(session, phone, text);
    case "convenio_cpf":
      return handleConvenioCpf(session, phone, text);
    case "convenio_cadastro_nome":
      return handleConvenioCadastroNome(session, phone, text);
    default:
      // Step desconhecido: recomeça.
      resetFlow(session);
      return startFlow(session, phone, text, detectIntent(text));
  }
}

// --- AGENDAR ---

async function handleAgendarCpf(session, phone, text) {
  const cpf = onlyDigits(text);
  if (cpf.length !== 11) {
    await replyS(session, phone, "Hmm, esse CPF não parece completo. Pode me mandar os *11 números*, sem pontos nem traços?");
    return;
  }
  session.cpf = cpf;
  const patient = await identifyPatient(cpf, session.profissionalId);
  if (patient) {
    session.patientKind = patient.kind; // 'user' | 'private'
    session.pacienteId = patient.userId || null;
    session.privatePatientId = patient.privatePatientId || null;
    session.pacienteNome = patient.name;
    session.priceProfile = patient.profile; // 'convenio' | 'particular'
    await replyS(session, phone, `Achei seu cadastro, ${firstName(patient.name)}! 😊`);
    await proceedToProfissional(session, phone);
  } else {
    session.step = "agendar_tipo_cadastro";
    await replyS(
      session,
      phone,
      "Não localizei um cadastro com esse CPF. Sem problema! Você prefere adquirir o plano do *Convênio Quiro Ferreira* ou seguir como *paciente particular*? É só responder *convênio* ou *particular*."
    );
  }
}

async function handleAgendarTipoCadastro(session, phone, text) {
  const n = normalize(text);
  if (n.includes("conven")) {
    session.newPatientKind = "convenio";
  } else if (n.includes("particular")) {
    session.newPatientKind = "private";
  } else {
    await replyS(session, phone, "Só pra eu entender direitinho: você quer *convênio* ou *particular*?");
    return;
  }
  session.step = "agendar_cadastro_nome";
  await replyS(session, phone, "Combinado! E qual é o seu *nome completo*?");
}

async function handleAgendarCadastroNome(session, phone, text) {
  const nome = text.trim();
  if (nome.length < 3) {
    await replyS(session, phone, "Pode me enviar seu *nome completo*? Assim já deixo tudo certinho no cadastro.");
    return;
  }
  if (session.newPatientKind === "private") {
    const created = await createPrivatePatient({
      name: nome,
      phone,
      cpf: session.cpf,
      professionalId: session.profissionalId,
    });
    session.patientKind = "private";
    session.privatePatientId = created.id;
    session.pacienteId = null;
    session.pacienteNome = created.name;
    session.priceProfile = "particular";
    await audit({ phone, actor: "ai", action: "private_patient_created", detail: { privatePatientId: created.id }, professionalId: session.profissionalId });
  } else {
    // Novo conveniado: ainda sem assinatura ativa, então o preço desta consulta é o particular.
    const created = await createClient({ name: nome, phone, cpf: session.cpf });
    session.patientKind = "user";
    session.pacienteId = created.id;
    session.privatePatientId = null;
    session.pacienteNome = created.name;
    session.priceProfile = "particular";
    await audit({ phone, actor: "ai", action: "client_created", detail: { clientId: created.id }, professionalId: session.profissionalId });
  }
  await proceedToProfissional(session, phone);
}

async function proceedToProfissional(session, phone) {
  if (session.profissionalId) {
    await proceedToDays(session, phone);
    return;
  }
  const profs = await getProfessionalsWithBaseService();
  if (profs.length === 0) {
    await replyS(session, phone, "Poxa, no momento não há profissionais com agenda aberta. Tenta de novo daqui a pouco, tá?");
    resetFlow(session);
    return;
  }
  if (profs.length === 1) {
    session.profissionalId = profs[0].id;
    await proceedToDays(session, phone);
    return;
  }
  session.professionals = profs;
  session.step = "agendar_escolha_profissional";
  const list = profs.map((p, i) => `*${i + 1}.* ${p.name}`).join("\n");
  await replyS(session, phone, `Com qual profissional você gostaria de ser atendido(a)?\n\n${list}\n\nÉ só me responder com o *número*. 🙂`);
}

async function handleAgendarEscolhaProfissional(session, phone, text) {
  const profs = session.professionals || [];
  const idx = parseInt(onlyDigits(text), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= profs.length) {
    await replyS(session, phone, "Não peguei qual foi. Pode me responder com o *número* do profissional da lista?");
    return;
  }
  session.profissionalId = profs[idx].id;
  await proceedToDays(session, phone);
}

// ===== ESCOLHA DE DIA → HORÁRIO (compartilhado por agendar e reagendar) =====

// Resolve o serviço-base e o valor conforme o perfil (conveniado/particular).
// Retorna true se ok; envia mensagem e reseta o fluxo em caso de indisponibilidade.
async function ensureBaseService(session, phone) {
  const base = await getBaseService(session.profissionalId, session.priceProfile || "convenio");
  if (!base) {
    await replyS(session, phone, "Esse profissional ainda não tem os serviços configurados. Assim que estiver, te aviso! 🙏");
    resetFlow(session);
    return false;
  }
  session.serviceId = base.service_id;
  session.serviceValue = base.value;
  session.serviceIsOnline = base.isOnline; // define se a consulta gera link Meet
  return true;
}

// Oferece os dias com horário livre e aguarda a escolha do paciente.
async function proceedToDays(session, phone) {
  if (!(await ensureBaseService(session, phone))) return;

  const days = await getAvailableDays(session.profissionalId, { limit: 6 });
  if (days.length === 0) {
    await replyS(session, phone, `${personal(session)}não encontrei horários livres nos próximos dias. 😕 Pode tentar mais tarde ou me chamar de novo em outra data.`);
    resetFlow(session);
    return;
  }
  session.days = days;
  session.chosenDay = null;
  session.slots = null;
  session.step = "escolha_dia";
  const list = days.map((d, i) => `*${i + 1}.* ${d.label}`).join("\n");
  await replyS(
    session,
    phone,
    `${personal(session)}para qual *dia* fica melhor pra você? Estes são os dias com horário disponível:\n\n${list}\n\nResponda com o *número* do dia. 📅`
  );
}

async function handleEscolhaDia(session, phone, text) {
  const days = session.days || [];
  const idx = parseInt(onlyDigits(text), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= days.length) {
    await replyS(session, phone, "Não consegui identificar o dia. Pode responder com o *número* de um dos dias da lista? 🙂");
    return;
  }
  const day = days[idx];
  const slots = await getFreeSlotsForDay(session.profissionalId, day.dateBrazil);
  if (slots.length === 0) {
    // Alguém pode ter ocupado o último horário desse dia nesse meio-tempo.
    await replyS(session, phone, "Puxa, os horários desse dia acabaram de ser preenchidos. Vou te mostrar os dias disponíveis de novo:");
    await proceedToDays(session, phone);
    return;
  }
  session.chosenDay = day;
  session.slots = slots;
  session.step = "escolha_hora";
  // Lista até 12 horários para não ficar gigante; costuma cobrir o dia todo.
  const shown = slots.slice(0, 12);
  const list = shown.map((s, i) => `*${i + 1}.* ${s.time}`).join("\n");
  const extra = slots.length > shown.length ? "\n\n(Se preferir outro horário, me diga que eu mostro mais.)" : "";
  await replyS(
    session,
    phone,
    `Ótimo! Para *${day.label}*, tenho estes horários livres:\n\n${list}\n\nQual deles fica bom? Responda com o *número* do horário. ⏰${extra}`
  );
}

async function handleEscolhaHora(session, phone, text) {
  const n = normalize(text);
  // Deixa o paciente voltar e escolher outro dia.
  if (n.includes("voltar") || n.includes("outro dia") || n.includes("outra data")) {
    await proceedToDays(session, phone);
    return;
  }
  const slots = session.slots || [];
  const shown = slots.slice(0, 12);
  const idx = parseInt(onlyDigits(text), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= shown.length) {
    await replyS(session, phone, 'Não peguei o horário. Responda com o *número* da lista, ou diga *"outro dia"* para trocar a data. 🙂');
    return;
  }
  const slot = shown[idx];
  if (session.flow === "reagendar") {
    await finalizeReagendamento(session, phone, slot);
  } else {
    await finalizeAgendamento(session, phone, slot);
  }
}

async function finalizeAgendamento(session, phone, slot) {
  const result = await createConsultation({
    professionalId: session.profissionalId,
    userId: session.pacienteId,
    privatePatientId: session.privatePatientId,
    serviceId: session.serviceId,
    value: session.serviceValue,
    isoUTC: slot.isoUTC,
  });
  if (!result.ok) {
    await replyS(session, phone, result.message || "Esse horário escapou por segundos! 😅 Vamos escolher outro:");
    await proceedToDays(session, phone); // recarrega dias/horários
    return;
  }
  await audit({
    phone,
    actor: "ai",
    action: "consultation_created",
    detail: { consultationId: result.id, professionalId: session.profissionalId, date: slot.isoUTC },
    professionalId: session.profissionalId,
  });
  // Sincroniza com o Google Agenda; se for consulta online, obtém o link do Meet.
  let meetLink = null;
  try {
    meetLink = await syncCreateEvent(result.id);
  } catch (e) {
    botLog("sync_create_error", { error: String(e) });
  }
  const profName = await getProfessionalName(session.profissionalId);
  let confirm =
    `Prontinho, ${firstName(session.pacienteNome) || "sua consulta está marcada"}! ✅\n\n` +
    `📅 ${formatToBrazilDate(slot.isoUTC)} (${session.chosenDay?.label?.split(" ")[0] || ""}) às ${slot.time}\n` +
    `👨‍⚕️ ${profName}`;
  if (session.serviceIsOnline) {
    confirm += meetLink
      ? `\n🔗 Link da sua consulta online: ${meetLink}`
      : `\n💻 É uma consulta online — te envio o link da videochamada em seguida.`;
  }
  confirm += `\n\nSe surgir qualquer imprevisto, é só me chamar aqui que a gente reorganiza. Até lá! 😊`;
  await replyS(session, phone, confirm);
  resetFlow(session);
}

// --- REAGENDAR ---

async function handleReagendarCpf(session, phone, text) {
  const cpf = onlyDigits(text);
  if (cpf.length !== 11) {
    await replyS(session, phone, "Esse CPF não parece completo. Pode me mandar os *11 números*, por favor?");
    return;
  }
  const patient = await identifyPatient(cpf, session.profissionalId);
  if (!patient) {
    await replyS(session, phone, 'Não localizei um cadastro com esse CPF. Se quiser marcar uma consulta nova, é só me mandar *"agendar"*. 🙂');
    resetFlow(session);
    return;
  }
  session.pacienteId = patient.userId || null;
  session.privatePatientId = patient.privatePatientId || null;
  session.pacienteNome = patient.name;
  session.priceProfile = patient.profile;
  const consulta = await getNextActiveConsultation({
    userId: patient.userId,
    privatePatientId: patient.privatePatientId,
  });
  if (!consulta) {
    await replyS(session, phone, `${personal(session)}não encontrei nenhuma consulta futura pra remarcar. Se quiser marcar uma nova, é só mandar *"agendar"*. 🙂`);
    resetFlow(session);
    return;
  }
  session.consultaId = consulta.id;
  session.profissionalId = consulta.professional_id;
  session.step = "reagendar_confirma";
  await replyS(
    session,
    phone,
    `${personal(session)}encontrei sua consulta:\n\n📅 ${formatToBrazilDate(consulta.date)} às ${formatToBrazilTimeOnly(consulta.date)}\n👨‍⚕️ ${consulta.professional_name}\n\nÉ essa que você quer remarcar? Responda *Sim* ou *Não*.`
  );
}

async function handleReagendarConfirma(session, phone, text) {
  if (isYes(text)) {
    await proceedToDays(session, phone);
  } else if (isNo(text)) {
    await replyS(session, phone, "Sem problema, deixei sua consulta do jeito que estava. 🙂 Precisa de mais alguma coisa?");
    resetFlow(session);
  } else {
    await replyS(session, phone, "Só me confirma com *Sim* ou *Não*, por favor. 🙂");
  }
}

async function finalizeReagendamento(session, phone, slot) {
  const res = await rescheduleConsultation(session.consultaId, slot.isoUTC, session.profissionalId);
  if (!res.ok) {
    await replyS(session, phone, res.message || "Esse horário escapou por segundos! 😅 Vamos escolher outro:");
    await proceedToDays(session, phone);
    return;
  }
  await audit({
    phone,
    actor: "ai",
    action: "consultation_rescheduled",
    detail: { consultationId: session.consultaId, date: slot.isoUTC },
    professionalId: session.profissionalId,
  });
  syncUpdateEvent(session.consultaId).catch((e) => botLog("sync_update_error", { error: String(e) }));
  await replyS(
    session,
    phone,
    `Prontinho, ${firstName(session.pacienteNome) || "está remarcada"}! ✅ Sua consulta agora é *${formatToBrazilDate(slot.isoUTC)} às ${slot.time}*. Te espero lá! 😊`
  );
  resetFlow(session);
}

// --- CANCELAR ---

async function handleCancelarCpf(session, phone, text) {
  const cpf = onlyDigits(text);
  if (cpf.length !== 11) {
    await replyS(session, phone, "Esse CPF não parece completo. Pode me mandar os *11 números*, por favor?");
    return;
  }
  const patient = await identifyPatient(cpf, session.profissionalId);
  if (!patient) {
    await replyS(session, phone, "Não localizei um cadastro com esse CPF. Confere pra mim se digitou certinho?");
    resetFlow(session);
    return;
  }
  session.pacienteId = patient.userId || null;
  session.privatePatientId = patient.privatePatientId || null;
  session.pacienteNome = patient.name;
  const consulta = await getNextActiveConsultation({
    userId: patient.userId,
    privatePatientId: patient.privatePatientId,
  });
  if (!consulta) {
    await replyS(session, phone, `${personal(session)}você não tem nenhuma consulta futura pra cancelar. 🙂`);
    resetFlow(session);
    return;
  }
  session.consultaId = consulta.id;
  session.step = "cancelar_confirma";
  await replyS(
    session,
    phone,
    `${personal(session)}encontrei sua consulta:\n\n📅 ${formatToBrazilDate(consulta.date)} às ${formatToBrazilTimeOnly(consulta.date)}\n👨‍⚕️ ${consulta.professional_name}\n\nPosso confirmar o cancelamento? Responda *Sim* ou *Não*.`
  );
}

async function handleCancelarConfirma(session, phone, text) {
  if (isYes(text)) {
    const ok = await cancelConsultation(session.consultaId);
    if (ok) {
      await audit({
        phone,
        actor: "ai",
        action: "consultation_cancelled",
        detail: { consultationId: session.consultaId },
        professionalId: session.profissionalId,
      });
      syncCancelEvent(session.consultaId).catch((e) => botLog("sync_cancel_error", { error: String(e) }));
      await replyS(session, phone, "Pronto, sua consulta foi cancelada. 🙂 Quando quiser remarcar, é só me chamar aqui — vai ser um prazer te atender!");
    } else {
      await replyS(session, phone, "Hmm, não consegui localizar a consulta pra cancelar agora. Pode tentar de novo em instantes?");
    }
    resetFlow(session);
  } else if (isNo(text)) {
    await replyS(session, phone, "Perfeito, mantive sua consulta como estava. 😊");
    resetFlow(session);
  } else {
    await replyS(session, phone, "Só me confirma com *Sim* ou *Não*, por favor. 🙂");
  }
}

// --- CONVENIO (IA) ---

async function handleConvenioChat(session, phone, text) {
  if (normalize(text).includes("contratar")) {
    session.step = "convenio_cpf";
    await replyS(session, phone, "Que alegria ter você com a gente! 🎉 Pra iniciar seu contrato, me informa seu *CPF* (só os números)?");
    return;
  }
  // Mantém o contexto da conversa entre mensagens (últimas 10 trocas, p/ controlar custo).
  const history = Array.isArray(session.convenioHistory) ? session.convenioHistory : [];
  history.push({ role: "user", content: text });
  const professionalName = await professionalDisplayName(session);
  const ai = await callAnthropic(history.slice(-10), professionalName);
  if (ai?.usage) {
    await recordAiUsage({ phone, professionalId: session.profissionalId, usage: ai.usage, model: ai.model });
  }
  const reply = ai?.text || humanFallbackText();
  history.push({ role: "assistant", content: reply });
  session.convenioHistory = history.slice(-10);
  await replyS(session, phone, reply);
  // Permanece em convenio_chat para continuar a conversa.
  session.step = "convenio_chat";
}

async function handleConvenioCpf(session, phone, text) {
  const cpf = onlyDigits(text);
  if (cpf.length !== 11) {
    await replyS(session, phone, "CPF inválido. Envie os *11 números* do seu CPF.");
    return;
  }
  session.cpf = cpf;
  const client = await findClientByCpf(cpf);
  if (client) {
    session.pacienteNome = client.name;
    await replyS(session, phone, `Achei seu cadastro, ${firstName(client.name)}! 😊 Já te envio o *link de pagamento* em seguida. Assim que o pagamento for confirmado, você recebe o acesso ao painel.`);
    resetFlow(session);
  } else {
    session.step = "convenio_cadastro_nome";
    await replyS(session, phone, "Ainda não tem cadastro por aqui — vamos criar rapidinho! Qual é o seu *nome completo*?");
  }
}

async function handleConvenioCadastroNome(session, phone, text) {
  const nome = text.trim();
  if (nome.length < 3) {
    await replyS(session, phone, "Pode me enviar seu *nome completo*? 🙂");
    return;
  }
  const created = await createClient({ name: nome, phone, cpf: session.cpf });
  await audit({ phone, actor: "ai", action: "client_created", detail: { clientId: created.id }, professionalId: session.profissionalId });
  await replyS(session, phone, `Prontinho, ${firstName(nome)}! Seu cadastro foi iniciado. 🎉 Já te envio o *link de pagamento* em seguida — depois da confirmação, você recebe o acesso ao painel.`);
  resetFlow(session);
}

// ===== ROTEAMENTO =====

async function routeMessage(session, phone, text) {
  if (!session.step) {
    const intent = detectIntent(text);
    session.intent = intent;
    await audit({ phone, actor: "patient", action: "intent_detected", detail: { intent, text }, professionalId: session.profissionalId });
    await startFlow(session, phone, text, intent);
  } else {
    await continueFlow(session, phone, text);
  }
  await saveSession(phone, session);
}

// ===== WEBHOOK =====

export function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    botLog("webhook_verified", {});
    return res.status(200).send(challenge);
  }
  botLog("webhook_verify_failed", {});
  return res.sendStatus(403);
}

// Adaptador do webhook da Meta Cloud API: desmonta o payload e delega ao núcleo.
export async function handleWebhookEvent(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return; // status callbacks e outros eventos: ignorar

  await processInbound({
    phone: message.from,
    messageId: message.id,
    type: message.type,
    textBody: message.type === "text" ? message.text?.body || "" : "",
    phoneNumberId: value?.metadata?.phone_number_id,
    displayNumber: value?.metadata?.display_phone_number,
  });
}

/**
 * Núcleo de processamento de uma mensagem de entrada, agnóstico ao transporte.
 * Chamado pelo webhook da Meta (handleWebhookEvent) e pelo adaptador Baileys.
 * @param {object} msg
 * @param {string} msg.phone         telefone do paciente (dígitos, com DDI)
 * @param {string} msg.messageId     id da mensagem (idempotência)
 * @param {string} msg.type          "text" | "audio" | ...
 * @param {string} msg.textBody      corpo do texto (vazio se não-texto)
 * @param {string|null} msg.phoneNumberId   Phone Number ID de origem (Cloud API); null no Baileys
 * @param {string|null} msg.displayNumber   número que recebeu (resolve o profissional)
 */
export async function processInbound({ phone, messageId, type, textBody = "", phoneNumberId = null, displayNumber = null }) {
  botLog("inbound", { phone, messageId, type });

  // Multi-número: o número que recebeu define o profissional (resolvido cedo para
  // atribuir as mensagens/auditoria ao profissional certo nos relatórios).
  const mappedProf = resolveProfessionalFromNumber(phoneNumberId, displayNumber);

  // Idempotência: reentrega da Meta é registrada apenas uma vez.
  const isNewMessage = await recordInbound({ phone, messageId, text: textBody, professionalId: mappedProf });
  if (!isNewMessage) {
    botLog("duplicate_ignored", { messageId });
    return;
  }
  await audit({ phone, actor: "patient", action: "message_in", detail: { type }, professionalId: mappedProf });

  let session = (await loadSession(phone)) || newSession();
  session.phoneNumberId = phoneNumberId;

  // Conversa assumida por um operador humano: registra e silencia o bot.
  if (session.mode === "human") {
    await saveSession(phone, session); // renova TTL
    botLog("human_mode_skip", { phone });
    return;
  }

  // Áudio (e demais tipos não-texto): não processa, pede texto.
  if (type === "audio") {
    await replyS(session, phone, "Ainda não consigo ouvir áudios por aqui 🙈, mas pode me escrever o que precisa que eu te ajudo na hora!");
    await saveSession(phone, session);
    return;
  }
  if (type !== "text") {
    await replyS(session, phone, "Recebi seu envio! 🙂 Mas por aqui só consigo ler *mensagens de texto*. Pode me escrever o que precisa?");
    await saveSession(phone, session);
    return;
  }

  // Aplica o profissional resolvido pelo número à sessão.
  if (mappedProf) {
    session.profFromNumber = mappedProf;
    session.profissionalId = mappedProf;
  }

  try {
    await routeMessage(session, phone, textBody.trim());
  } catch (e) {
    botLog("route_error", { phone, error: String(e), stack: e?.stack });
    await replyS(session, phone, "Ops, tive um probleminha aqui do meu lado. 😅 Pode mandar de novo, por favor?");
    await saveSession(phone, session);
  }
}

// ===== HANDOFF (operador humano) =====

export async function takeoverConversation(phone, operatorId) {
  const session = (await loadSessionRaw(phone)) || newSession();
  session.mode = "human";
  session.owner_operator_id = operatorId;
  await saveSession(phone, session);
  await audit({ phone, actor: "human", actorId: operatorId, action: "takeover", professionalId: session.profissionalId || null });
  botLog("takeover", { phone, operatorId });
  return { ok: true };
}

export async function releaseConversation(phone, operatorId) {
  const session = (await loadSessionRaw(phone)) || newSession();
  session.mode = "bot";
  session.owner_operator_id = null;
  await saveSession(phone, session);
  await audit({ phone, actor: "human", actorId: operatorId, action: "release" });
  botLog("release", { phone, operatorId });
  return { ok: true };
}

export async function sendOperatorMessage(phone, text, operatorId) {
  let messageId = null;
  try {
    const resp = await sendText({ toDigits: phone, text });
    messageId = resp?.messages?.[0]?.id || null;
  } catch (e) {
    botLog("operator_send_error", { phone, error: String(e) });
    return { ok: false, message: "Falha ao enviar a mensagem pelo WhatsApp." };
  }
  await logOutbound({ phone, text, actor: "human", actorId: operatorId, messageId });
  await audit({ phone, actor: "human", actorId: operatorId, action: "message_out" });
  return { ok: true };
}

export async function getConversation(phone, limit = 50) {
  const r = await pool.query(
    `SELECT id, direction, actor, actor_id, intent, step, text, created_at
       FROM whatsapp_messages
      WHERE phone = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [phone, limit]
  );
  return r.rows.reverse();
}

// Casa o telefone do WhatsApp (dígitos, com DDI) com users.phone (formato livre),
// comparando os últimos 11 dígitos (DDD + 9 + número). Retorna Map<phone, nome>.
async function resolvePatientNames(phones) {
  const map = new Map();
  if (!phones.length) return map;

  const localByPhone = new Map();
  for (const p of phones) {
    let d = onlyDigits(p);
    if (d.length > 11 && d.startsWith("55")) d = d.slice(2); // remove DDI
    localByPhone.set(p, d.slice(-11));
  }
  const locals = [...new Set([...localByPhone.values()])];

  const r = await pool.query(
    `SELECT name, right(regexp_replace(phone, '\\D', '', 'g'), 11) AS last11
       FROM users
      WHERE phone IS NOT NULL
        AND right(regexp_replace(phone, '\\D', '', 'g'), 11) = ANY($1::text[])`,
    [locals]
  );
  const nameByLast11 = new Map();
  for (const row of r.rows) nameByLast11.set(row.last11, row.name);

  for (const [phone, last11] of localByPhone) {
    if (nameByLast11.has(last11)) map.set(phone, nameByLast11.get(last11));
  }
  return map;
}

// Lista as conversas ativas (mensagem nas últimas 48h) para o painel de
// atendimento humano. `scopeProfessionalId` restringe ao profissional vinculado
// (secretária); admin/profissional sem escopo recebem todas.
export async function listConversations({ scopeProfessionalId = null } = {}) {
  const r = await pool.query(
    `WITH last_msgs AS (
       SELECT DISTINCT ON (phone) phone, text AS last_message, created_at AS last_message_at
         FROM whatsapp_messages
        WHERE created_at > now() - interval '48 hours'
        ORDER BY phone, created_at DESC
     )
     SELECT lm.phone, lm.last_message, lm.last_message_at,
            s.session->>'mode' AS mode,
            (s.session->>'profissionalId')::int AS professional_id,
            (s.session->>'owner_operator_id')::int AS owner_operator_id
       FROM last_msgs lm
       LEFT JOIN whatsapp_sessions s ON s.phone = lm.phone
      ORDER BY lm.last_message_at DESC`
  );

  let rows = r.rows;
  if (scopeProfessionalId != null) {
    rows = rows.filter((row) => row.professional_id === scopeProfessionalId);
  }
  if (rows.length === 0) return [];

  // Resolve nomes de profissional e operador numa única consulta.
  const userIds = [
    ...new Set(
      rows.flatMap((row) => [row.professional_id, row.owner_operator_id]).filter(Boolean)
    ),
  ];
  const nameById = new Map();
  if (userIds.length) {
    const u = await pool.query(`SELECT id, name FROM users WHERE id = ANY($1::int[])`, [userIds]);
    for (const row of u.rows) nameById.set(row.id, row.name);
  }

  const patientNames = await resolvePatientNames(rows.map((row) => row.phone));

  return rows.map((row) => ({
    phone: row.phone,
    patient_name: patientNames.get(row.phone) || null,
    professional_id: row.professional_id || null,
    professional_name: row.professional_id ? nameById.get(row.professional_id) || null : null,
    status: row.mode === "human" ? "human" : "pending",
    last_message: row.last_message || "",
    last_message_at: row.last_message_at,
    assigned_to: row.owner_operator_id ? nameById.get(row.owner_operator_id) || null : null,
  }));
}

// ===== MÉTRICAS DE FUNIL =====

export async function getFunnelMetrics() {
  const [started, byIntent, created, rescheduled, cancelled, byStep, offeredSlot] =
    await Promise.all([
      pool.query("SELECT COUNT(DISTINCT phone)::int AS n FROM whatsapp_messages WHERE direction = 'inbound'"),
      pool.query(
        `SELECT detail->>'intent' AS intent, COUNT(*)::int AS n
           FROM whatsapp_audit_log WHERE action = 'intent_detected'
          GROUP BY 1 ORDER BY 2 DESC`
      ),
      pool.query("SELECT COUNT(*)::int AS n FROM whatsapp_audit_log WHERE action = 'consultation_created'"),
      pool.query("SELECT COUNT(*)::int AS n FROM whatsapp_audit_log WHERE action = 'consultation_rescheduled'"),
      pool.query("SELECT COUNT(*)::int AS n FROM whatsapp_audit_log WHERE action = 'consultation_cancelled'"),
      pool.query(
        `SELECT step, COUNT(DISTINCT phone)::int AS n
           FROM whatsapp_messages
          WHERE direction = 'outbound' AND step IS NOT NULL
          GROUP BY step ORDER BY 2 DESC`
      ),
      pool.query(
        // "Ofertou horário" = chegou ao passo de escolha de horário. Mantém os
        // steps legados para não zerar o histórico anterior à mudança de fluxo.
        `SELECT COUNT(DISTINCT phone)::int AS n
           FROM whatsapp_messages
          WHERE direction = 'outbound'
            AND step IN ('escolha_hora', 'agendar_escolha_slot', 'reagendar_escolha_slot')`
      ),
    ]);

  const conversas_iniciadas = started.rows[0].n;
  const ofertados_horario = offeredSlot.rows[0].n;
  const agendamentos_criados = created.rows[0].n;

  const por_intencao = {};
  for (const row of byIntent.rows) por_intencao[row.intent || "DESCONHECIDA"] = row.n;

  const por_step = {};
  for (const row of byStep.rows) por_step[row.step] = row.n;

  return {
    conversas_iniciadas,
    por_intencao,
    agendamentos: {
      ofertados_horario,
      criados: agendamentos_criados,
      taxa_conclusao: ofertados_horario ? +(agendamentos_criados / ofertados_horario).toFixed(3) : 0,
      abandono: Math.max(ofertados_horario - agendamentos_criados, 0),
    },
    reagendamentos_criados: rescheduled.rows[0].n,
    cancelamentos_criados: cancelled.rows[0].n,
    por_step,
  };
}

// ===== RELATÓRIO DE ATENDIMENTO (Seções 7 e 8) =====

// Tarifas do Claude Haiku 4.5 (USD por milhão de tokens), conforme o escopo.
const HAIKU_INPUT_USD_PER_MTOK = 1;
const HAIKU_OUTPUT_USD_PER_MTOK = 5;

/**
 * Relatório de atendimento do WhatsApp, agregado por período.
 * @param {object} opts
 * @param {string} opts.startDate "YYYY-MM-DD"
 * @param {string} opts.endDate   "YYYY-MM-DD"
 * @param {"day"|"week"|"month"} [opts.granularity="day"]
 * @param {number|null} [opts.scopeProfessionalId] null = agregado (admin);
 *   preenchido = escopado ao profissional.
 */
export async function getWhatsappReport({ startDate, endDate, granularity = "day", scopeProfessionalId = null }) {
  const gran = ["day", "week", "month"].includes(granularity) ? granularity : "day";
  const rate = Number(process.env.USD_BRL_RATE) || 5.2;

  const params = [startDate, endDate];
  let scopeSql = "";
  if (scopeProfessionalId != null) {
    params.push(scopeProfessionalId);
    scopeSql = " AND professional_id = $3";
  }
  const dateSql = "created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')";

  const [total, serie, fluxo, pico, novos, transfer, ia] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT phone)::int AS n FROM whatsapp_messages
        WHERE direction = 'inbound' AND ${dateSql}${scopeSql}`,
      params
    ),
    pool.query(
      `SELECT date_trunc('${gran}', created_at AT TIME ZONE 'America/Sao_Paulo')::date AS bucket,
              COUNT(DISTINCT phone)::int AS n
         FROM whatsapp_messages
        WHERE direction = 'inbound' AND ${dateSql}${scopeSql}
        GROUP BY 1 ORDER BY 1`,
      params
    ),
    pool.query(
      `SELECT detail->>'intent' AS intent, COUNT(*)::int AS n
         FROM whatsapp_audit_log
        WHERE action = 'intent_detected' AND ${dateSql}${scopeSql}
        GROUP BY 1 ORDER BY 2 DESC`,
      params
    ),
    pool.query(
      `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
              COUNT(*)::int AS n
         FROM whatsapp_messages
        WHERE direction = 'inbound' AND ${dateSql}${scopeSql}
        GROUP BY 1 ORDER BY 1`,
      params
    ),
    pool.query(
      `SELECT action, COUNT(*)::int AS n
         FROM whatsapp_audit_log
        WHERE action IN ('client_created', 'private_patient_created') AND ${dateSql}${scopeSql}
        GROUP BY 1`,
      params
    ),
    pool.query(
      `SELECT COALESCE(detail->>'reason', 'manual') AS reason, COUNT(*)::int AS n
         FROM whatsapp_audit_log
        WHERE action = 'takeover' AND ${dateSql}${scopeSql}
        GROUP BY 1 ORDER BY 2 DESC`,
      params
    ),
    pool.query(
      `SELECT COALESCE(SUM(input_tokens), 0)::bigint AS input,
              COALESCE(SUM(output_tokens), 0)::bigint AS output,
              COUNT(*)::int AS conversas
         FROM whatsapp_ai_usage
        WHERE ${dateSql}${scopeSql}`,
      params
    ),
  ]);

  const totalFluxo = fluxo.rows.reduce((acc, r) => acc + r.n, 0);
  const por_tipo_fluxo = fluxo.rows.map((r) => ({
    intent: r.intent || "DESCONHECIDA",
    n: r.n,
    pct: totalFluxo ? +((r.n / totalFluxo) * 100).toFixed(1) : 0,
  }));

  const novosMap = Object.fromEntries(novos.rows.map((r) => [r.action, r.n]));
  const transfer_total = transfer.rows.reduce((acc, r) => acc + r.n, 0);

  const inputTokens = Number(ia.rows[0].input);
  const outputTokens = Number(ia.rows[0].output);
  const custo_usd =
    (inputTokens / 1e6) * HAIKU_INPUT_USD_PER_MTOK +
    (outputTokens / 1e6) * HAIKU_OUTPUT_USD_PER_MTOK;

  return {
    periodo: { start: startDate, end: endDate, granularity: gran },
    escopo: scopeProfessionalId != null ? "professional" : "convenio",
    total_atendimentos: total.rows[0].n,
    serie_temporal: serie.rows.map((r) => ({ data: r.bucket, n: r.n })),
    por_tipo_fluxo,
    horario_pico: pico.rows.map((r) => ({ hora: r.hour, n: r.n })),
    novos_pacientes: {
      conveniados: novosMap.client_created || 0,
      particulares: novosMap.private_patient_created || 0,
    },
    transferidos_humano: {
      total: transfer_total,
      por_motivo: transfer.rows.map((r) => ({ motivo: r.reason, n: r.n })),
    },
    custo_ia: {
      conversas: ia.rows[0].conversas,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      custo_usd: +custo_usd.toFixed(4),
      custo_brl: +(custo_usd * rate).toFixed(2),
      usd_brl_rate: rate,
    },
  };
}
