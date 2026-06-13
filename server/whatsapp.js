/**
 * Secretária Virtual via WhatsApp (Meta Cloud API) — Convênio Quiro Ferreira.
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
  getFreeSlots,
} from "./utils/agenda.js";
import {
  formatToBrazilDate,
  formatToBrazilTimeOnly,
} from "./utils/dateHelpers.js";
import { sendWhatsappTextMessage } from "./utils/whatsappCloud.js";

const SESSION_TTL_MINUTES = 15;

const CONVENIO_SYSTEM_PROMPT = `Você é a secretária virtual do Convênio Quiro Ferreira.
Responda dúvidas sobre o convênio de forma clara e direta, sem enrolação.

Informações do convênio:
- Plano anual: R$ 600,00
- Benefícios: consultas com desconto, prioridade no agendamento, possibilidade de adicionar dependentes
- Acesso ao painel: cartaoquiroferreira.com.br — login com CPF e senha
- Especialidades disponíveis: conforme profissionais ativos no sistema

Quando o paciente quiser contratar:
1. Peça o CPF
2. Se não encontrar cadastro: colete nome e telefone
3. Informe que o link de pagamento será enviado em seguida
4. Encerre com: "Após a confirmação do pagamento você recebe o acesso ao painel."

Nunca invente informações. Se não souber algo, diga que vai verificar e que em breve retorna.
Seja breve. Máximo 3 parágrafos por resposta.`;

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

function formatSlot(slot) {
  return `${formatToBrazilDate(slot.isoUTC)} às ${slot.time}`;
}

function newSession() {
  return { step: null, mode: "bot" };
}

function resetFlow(session) {
  session.step = null;
  session.intent = null;
  session.cpf = null;
  session.pacienteId = null;
  session.pacienteNome = null;
  session.consultaId = null;
  session.slots = null;
  session.professionals = null;
  session.serviceId = null;
  session.serviceValue = null;
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
async function recordInbound({ phone, messageId, text, intent = null, step = null }) {
  const r = await pool.query(
    `INSERT INTO whatsapp_messages (phone, message_id, direction, actor, intent, step, text)
     VALUES ($1, $2, 'inbound', 'patient', $3, $4, $5)
     ON CONFLICT (message_id) DO NOTHING
     RETURNING id`,
    [phone, messageId || null, intent, step, text || null]
  );
  return r.rows.length > 0;
}

async function logOutbound({ phone, text, actor = "ai", actorId = null, intent = null, step = null, messageId = null }) {
  try {
    await pool.query(
      `INSERT INTO whatsapp_messages (phone, message_id, direction, actor, actor_id, intent, step, text)
       VALUES ($1, $2, 'outbound', $3, $4, $5, $6, $7)`,
      [phone, messageId, actor, actorId, intent, step, text]
    );
  } catch (e) {
    botLog("log_outbound_error", { error: String(e) });
  }
}

async function audit({ phone, actor, actorId = null, action, detail = null }) {
  try {
    await pool.query(
      `INSERT INTO whatsapp_audit_log (phone, actor, actor_id, action, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [phone, actor, actorId, action, detail ? JSON.stringify(detail) : null]
    );
  } catch (e) {
    botLog("audit_error", { error: String(e) });
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

async function reply(phone, text, { phoneNumberId, intent = null, step = null } = {}) {
  let messageId = null;
  try {
    const resp = await sendWhatsappTextMessage({ toDigits: phone, text, phoneNumberId });
    messageId = resp?.messages?.[0]?.id || null;
  } catch (e) {
    botLog("send_error", { phone, error: String(e) });
  }
  await logOutbound({ phone, text, actor: "ai", intent, step, messageId });
  await audit({ phone, actor: "ai", action: "message_out", detail: { step } });
}

// Envia usando o contexto da sessão (phoneNumberId/intent/step atuais).
async function replyS(session, phone, text) {
  await reply(phone, text, {
    phoneNumberId: session.phoneNumberId,
    intent: session.intent,
    step: session.step,
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

// Serviço base do profissional (is_base_service tem prioridade) e seu valor.
async function getBaseService(professionalId) {
  const r = await pool.query(
    `SELECT id AS service_id, base_price AS value
       FROM services
      WHERE professional_id = $1
      ORDER BY is_base_service DESC NULLS LAST, id ASC
      LIMIT 1`,
    [professionalId]
  );
  return r.rows[0] || null;
}

async function getNextActiveConsultation(clientId) {
  const r = await pool.query(
    `SELECT c.id, c.date, c.professional_id, u.name AS professional_name
       FROM consultations c
       JOIN users u ON c.professional_id = u.id
      WHERE c.user_id = $1 AND c.status != 'cancelled' AND c.date >= NOW()
      ORDER BY c.date ASC
      LIMIT 1`,
    [clientId]
  );
  return r.rows[0] || null;
}

// Replica a validação de expediente/conflito do POST /api/consultations.
async function createConsultation({ professionalId, userId, serviceId, value, isoUTC }) {
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
  const r = await pool.query(
    `INSERT INTO consultations (user_id, professional_id, service_id, value, date, status)
     VALUES ($1, $2, $3, $4, $5, 'scheduled')
     RETURNING id`,
    [userId, professionalId, serviceId, value, isoUTC]
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

async function callAnthropic(userText) {
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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: CONVENIO_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userText }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      botLog("anthropic_error", { status: res.status, data });
      return null;
    }
    return data?.content?.[0]?.text?.trim() || null;
  } catch (e) {
    botLog("anthropic_exception", { error: String(e) });
    return null;
  }
}

function humanFallbackText() {
  const human = onlyDigits(process.env.WHATSAPP_HUMAN_FALLBACK || "");
  return human
    ? `No momento não consigo detalhar isso por aqui. Fale com nossa equipe: https://wa.me/${human}`
    : "No momento não consigo detalhar isso por aqui. Vou verificar e em breve um atendente retorna.";
}

// ===== FLUXOS =====

async function startFlow(session, phone, text, intent) {
  switch (intent) {
    case "AGENDAR":
      session.step = "agendar_cpf";
      await replyS(session, phone, "Vamos agendar sua consulta. Por favor, me informe seu *CPF* (somente números).");
      break;
    case "REAGENDAR":
      session.step = "reagendar_cpf";
      await replyS(session, phone, "Vamos remarcar sua consulta. Me informe seu *CPF* (somente números).");
      break;
    case "CANCELAR":
      session.step = "cancelar_cpf";
      await replyS(session, phone, "Vamos cancelar sua consulta. Me informe seu *CPF* (somente números).");
      break;
    case "CONVENIO":
      session.step = "convenio_chat";
      await handleConvenioChat(session, phone, text);
      break;
    case "SAUDACAO":
    default:
      session.step = null;
      await replyS(
        session,
        phone,
        "Olá! 👋 Sou a secretária virtual. Posso te ajudar a *agendar*, *remarcar* ou *cancelar* uma consulta, ou tirar dúvidas sobre o *convênio*. O que você precisa?"
      );
      break;
  }
}

async function continueFlow(session, phone, text) {
  switch (session.step) {
    case "agendar_cpf":
      return handleAgendarCpf(session, phone, text);
    case "agendar_cadastro_nome":
      return handleAgendarCadastroNome(session, phone, text);
    case "agendar_escolha_profissional":
      return handleAgendarEscolhaProfissional(session, phone, text);
    case "agendar_escolha_slot":
      return handleAgendarEscolhaSlot(session, phone, text);
    case "reagendar_cpf":
      return handleReagendarCpf(session, phone, text);
    case "reagendar_confirma":
      return handleReagendarConfirma(session, phone, text);
    case "reagendar_escolha_slot":
      return handleReagendarEscolhaSlot(session, phone, text);
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
    await replyS(session, phone, "CPF inválido. Envie os *11 números* do seu CPF, por favor.");
    return;
  }
  session.cpf = cpf;
  const client = await findClientByCpf(cpf);
  if (client) {
    session.pacienteId = client.id;
    session.pacienteNome = client.name;
    await proceedToProfissional(session, phone);
  } else {
    session.step = "agendar_cadastro_nome";
    await replyS(session, phone, "Não encontrei seu cadastro. Qual é o seu *nome completo*?");
  }
}

async function handleAgendarCadastroNome(session, phone, text) {
  const nome = text.trim();
  if (nome.length < 3) {
    await replyS(session, phone, "Por favor, envie seu *nome completo*.");
    return;
  }
  const created = await createClient({ name: nome, phone, cpf: session.cpf });
  session.pacienteId = created.id;
  session.pacienteNome = created.name;
  await audit({ phone, actor: "ai", action: "client_created", detail: { clientId: created.id } });
  await proceedToProfissional(session, phone);
}

async function proceedToProfissional(session, phone) {
  if (session.profissionalId) {
    await proceedToSlots(session, phone, "agendar_escolha_slot");
    return;
  }
  const profs = await getProfessionalsWithBaseService();
  if (profs.length === 0) {
    await replyS(session, phone, "No momento não há profissionais disponíveis para agendamento. Tente novamente mais tarde.");
    resetFlow(session);
    return;
  }
  if (profs.length === 1) {
    session.profissionalId = profs[0].id;
    await proceedToSlots(session, phone, "agendar_escolha_slot");
    return;
  }
  session.professionals = profs;
  session.step = "agendar_escolha_profissional";
  const list = profs.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
  await replyS(session, phone, `Com qual profissional você quer agendar?\n\n${list}\n\nResponda com o *número*.`);
}

async function handleAgendarEscolhaProfissional(session, phone, text) {
  const profs = session.professionals || [];
  const idx = parseInt(onlyDigits(text), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= profs.length) {
    await replyS(session, phone, "Escolha inválida. Responda com o *número* do profissional.");
    return;
  }
  session.profissionalId = profs[idx].id;
  await proceedToSlots(session, phone, "agendar_escolha_slot");
}

// Lista os próximos horários livres e aguarda a escolha (nextStep define o handler).
async function proceedToSlots(session, phone, nextStep) {
  const base = await getBaseService(session.profissionalId);
  if (!base) {
    await replyS(session, phone, "Esse profissional ainda não tem serviços configurados. Tente novamente mais tarde.");
    resetFlow(session);
    return;
  }
  session.serviceId = base.service_id;
  session.serviceValue = base.value;

  const slots = await getFreeSlots(session.profissionalId, { maxSlots: 5 });
  if (slots.length === 0) {
    await replyS(session, phone, "Não encontrei horários livres nos próximos dias. Você pode tentar mais tarde.");
    resetFlow(session);
    return;
  }
  session.slots = slots;
  session.step = nextStep;
  const list = slots.map((s, i) => `${i + 1}. ${formatSlot(s)}`).join("\n");
  await replyS(session, phone, `Estes são os próximos horários disponíveis:\n\n${list}\n\nResponda com o *número* do horário desejado.`);
}

async function handleAgendarEscolhaSlot(session, phone, text) {
  const slots = session.slots || [];
  const idx = parseInt(onlyDigits(text), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= slots.length) {
    await replyS(session, phone, "Escolha inválida. Responda com o *número* do horário.");
    return;
  }
  const slot = slots[idx];
  const result = await createConsultation({
    professionalId: session.profissionalId,
    userId: session.pacienteId,
    serviceId: session.serviceId,
    value: session.serviceValue,
    isoUTC: slot.isoUTC,
  });
  if (!result.ok) {
    await replyS(session, phone, result.message || "Não consegui agendar esse horário. Pode escolher outro?");
    await proceedToSlots(session, phone, "agendar_escolha_slot"); // recarrega horários
    return;
  }
  await audit({
    phone,
    actor: "ai",
    action: "consultation_created",
    detail: { consultationId: result.id, professionalId: session.profissionalId, date: slot.isoUTC },
  });
  const profName = await getProfessionalName(session.profissionalId);
  await replyS(
    session,
    phone,
    `✅ Consulta agendada!\n\n📅 ${formatToBrazilDate(slot.isoUTC)} às ${slot.time}\n👨‍⚕️ ${profName}\n\nEm caso de imprevisto é só mandar mensagem aqui. Até lá! 😊`
  );
  resetFlow(session);
}

// --- REAGENDAR ---

async function handleReagendarCpf(session, phone, text) {
  const cpf = onlyDigits(text);
  if (cpf.length !== 11) {
    await replyS(session, phone, "CPF inválido. Envie os *11 números* do seu CPF.");
    return;
  }
  const client = await findClientByCpf(cpf);
  if (!client) {
    await replyS(session, phone, 'Não encontrei cadastro com esse CPF. Para marcar uma nova consulta, envie "agendar".');
    resetFlow(session);
    return;
  }
  session.pacienteId = client.id;
  const consulta = await getNextActiveConsultation(client.id);
  if (!consulta) {
    await replyS(session, phone, 'Você não tem nenhuma consulta futura para remarcar. Para marcar uma nova, envie "agendar".');
    resetFlow(session);
    return;
  }
  session.consultaId = consulta.id;
  session.profissionalId = consulta.professional_id;
  session.step = "reagendar_confirma";
  await replyS(
    session,
    phone,
    `Encontrei esta consulta:\n\n📅 ${formatToBrazilDate(consulta.date)} às ${formatToBrazilTimeOnly(consulta.date)}\n👨‍⚕️ ${consulta.professional_name}\n\nDeseja remarcar? Responda *Sim* ou *Não*.`
  );
}

async function handleReagendarConfirma(session, phone, text) {
  if (isYes(text)) {
    await proceedToSlots(session, phone, "reagendar_escolha_slot");
  } else if (isNo(text)) {
    await replyS(session, phone, "Tudo bem, sua consulta foi mantida. Precisa de mais alguma coisa?");
    resetFlow(session);
  } else {
    await replyS(session, phone, "Por favor, responda *Sim* ou *Não*.");
  }
}

async function handleReagendarEscolhaSlot(session, phone, text) {
  const slots = session.slots || [];
  const idx = parseInt(onlyDigits(text), 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= slots.length) {
    await replyS(session, phone, "Escolha inválida. Responda com o *número* do horário.");
    return;
  }
  const slot = slots[idx];
  const res = await rescheduleConsultation(session.consultaId, slot.isoUTC, session.profissionalId);
  if (!res.ok) {
    await replyS(session, phone, res.message || "Não consegui remarcar para esse horário. Escolha outro.");
    await proceedToSlots(session, phone, "reagendar_escolha_slot");
    return;
  }
  await audit({
    phone,
    actor: "ai",
    action: "consultation_rescheduled",
    detail: { consultationId: session.consultaId, date: slot.isoUTC },
  });
  await replyS(session, phone, `✅ Consulta remarcada para ${formatToBrazilDate(slot.isoUTC)} às ${slot.time}. Até lá! 😊`);
  resetFlow(session);
}

// --- CANCELAR ---

async function handleCancelarCpf(session, phone, text) {
  const cpf = onlyDigits(text);
  if (cpf.length !== 11) {
    await replyS(session, phone, "CPF inválido. Envie os *11 números* do seu CPF.");
    return;
  }
  const client = await findClientByCpf(cpf);
  if (!client) {
    await replyS(session, phone, "Não encontrei cadastro com esse CPF.");
    resetFlow(session);
    return;
  }
  session.pacienteId = client.id;
  const consulta = await getNextActiveConsultation(client.id);
  if (!consulta) {
    await replyS(session, phone, "Você não tem nenhuma consulta futura para cancelar.");
    resetFlow(session);
    return;
  }
  session.consultaId = consulta.id;
  session.step = "cancelar_confirma";
  await replyS(
    session,
    phone,
    `Encontrei esta consulta:\n\n📅 ${formatToBrazilDate(consulta.date)} às ${formatToBrazilTimeOnly(consulta.date)}\n👨‍⚕️ ${consulta.professional_name}\n\nConfirma o cancelamento? Responda *Sim* ou *Não*.`
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
      });
      await replyS(session, phone, "✅ Consulta cancelada. Quando quiser reagendar é só mandar mensagem aqui.");
    } else {
      await replyS(session, phone, "Não consegui localizar a consulta para cancelar. Pode tentar novamente?");
    }
    resetFlow(session);
  } else if (isNo(text)) {
    await replyS(session, phone, "Tudo bem, sua consulta foi mantida.");
    resetFlow(session);
  } else {
    await replyS(session, phone, "Por favor, responda *Sim* ou *Não*.");
  }
}

// --- CONVENIO (IA) ---

async function handleConvenioChat(session, phone, text) {
  if (normalize(text).includes("contratar")) {
    session.step = "convenio_cpf";
    await replyS(session, phone, "Que ótimo! Para iniciar seu contrato, me informe seu *CPF* (somente números).");
    return;
  }
  const aiText = await callAnthropic(text);
  await replyS(session, phone, aiText || humanFallbackText());
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
    await replyS(session, phone, "Encontrei seu cadastro! Vou te enviar o *link de pagamento* em seguida. Após a confirmação do pagamento você recebe o acesso ao painel.");
    resetFlow(session);
  } else {
    session.step = "convenio_cadastro_nome";
    await replyS(session, phone, "Não encontrei cadastro. Qual é o seu *nome completo*?");
  }
}

async function handleConvenioCadastroNome(session, phone, text) {
  const nome = text.trim();
  if (nome.length < 3) {
    await replyS(session, phone, "Por favor, envie seu *nome completo*.");
    return;
  }
  const created = await createClient({ name: nome, phone, cpf: session.cpf });
  await audit({ phone, actor: "ai", action: "client_created", detail: { clientId: created.id } });
  await replyS(session, phone, "Cadastro iniciado! Vou te enviar o *link de pagamento* em seguida. Após a confirmação do pagamento você recebe o acesso ao painel.");
  resetFlow(session);
}

// ===== ROTEAMENTO =====

async function routeMessage(session, phone, text) {
  if (!session.step) {
    const intent = detectIntent(text);
    session.intent = intent;
    await audit({ phone, actor: "patient", action: "intent_detected", detail: { intent, text } });
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

export async function handleWebhookEvent(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return; // status callbacks e outros eventos: ignorar

  const phone = message.from;
  const messageId = message.id;
  const type = message.type;
  const phoneNumberId = value?.metadata?.phone_number_id;
  const displayNumber = value?.metadata?.display_phone_number;
  const textBody = type === "text" ? message.text?.body || "" : "";

  botLog("inbound", { phone, messageId, type });

  // Idempotência: reentrega da Meta é registrada apenas uma vez.
  const isNewMessage = await recordInbound({ phone, messageId, text: textBody });
  if (!isNewMessage) {
    botLog("duplicate_ignored", { messageId });
    return;
  }
  await audit({ phone, actor: "patient", action: "message_in", detail: { type } });

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
    await replyS(session, phone, "No momento atendo apenas por texto. Pode digitar o que precisa?");
    await saveSession(phone, session);
    return;
  }
  if (type !== "text") {
    await replyS(session, phone, "Recebi seu envio, mas só consigo ler mensagens de *texto*. Pode digitar?");
    await saveSession(phone, session);
    return;
  }

  // Multi-número: o número que recebeu define o profissional.
  const mappedProf = resolveProfessionalFromNumber(phoneNumberId, displayNumber);
  if (mappedProf) {
    session.profFromNumber = mappedProf;
    session.profissionalId = mappedProf;
  }

  try {
    await routeMessage(session, phone, textBody.trim());
  } catch (e) {
    botLog("route_error", { phone, error: String(e), stack: e?.stack });
    await replyS(session, phone, "Tive um problema interno. Pode tentar novamente?");
    await saveSession(phone, session);
  }
}

// ===== HANDOFF (operador humano) =====

export async function takeoverConversation(phone, operatorId) {
  const session = (await loadSessionRaw(phone)) || newSession();
  session.mode = "human";
  session.owner_operator_id = operatorId;
  await saveSession(phone, session);
  await audit({ phone, actor: "human", actorId: operatorId, action: "takeover" });
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
    const resp = await sendWhatsappTextMessage({ toDigits: phone, text });
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
        `SELECT COUNT(DISTINCT phone)::int AS n
           FROM whatsapp_messages
          WHERE direction = 'outbound' AND step IN ('agendar_escolha_slot', 'reagendar_escolha_slot')`
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
