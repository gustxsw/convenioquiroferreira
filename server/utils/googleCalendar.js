/**
 * Integração Google Agenda + Google Meet (bidirecional) — wrapper sobre `googleapis`.
 *
 * - OAuth2 por profissional (refresh token armazenado em google_oauth_tokens).
 * - Saída: criar/atualizar/apagar evento no Google Agenda do profissional;
 *   eventos online geram link do Google Meet (conferenceData).
 * - Entrada: canal de push (events.watch) + sincronização incremental (syncToken),
 *   consumidos por server/utils/googleInbound.js.
 *
 * Eventos criados pelo sistema recebem extendedProperties.private.source='convenio'
 * para que a reconciliação de entrada os distinga de eventos pessoais do profissional.
 */

import { google } from "googleapis";
import jwt from "jsonwebtoken";
import { pool } from "../db.js";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

const EVENT_SOURCE_TAG = "convenio";

// ===== LOG ESTRUTURADO (imune ao silenciamento de console.* em produção) =====
function gcalLog(event, data = {}) {
  try {
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), src: "gcal", event, ...data }) + "\n"
    );
  } catch {
    /* nunca deixar o log quebrar o fluxo */
  }
}

export function isGoogleConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim() &&
    process.env.GOOGLE_REDIRECT_URI?.trim()
  );
}

// ===== OAUTH =====

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID?.trim(),
    process.env.GOOGLE_CLIENT_SECRET?.trim(),
    process.env.GOOGLE_REDIRECT_URI?.trim()
  );
}

// URL de consentimento. `state` é o professionalId assinado com JWT_SECRET para
// validação no callback (evita CSRF e identifica o profissional sem sessão).
export function getAuthUrl(professionalId) {
  const state = jwt.sign({ professionalId }, process.env.JWT_SECRET, { expiresIn: "10m" });
  return getOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // força emissão de refresh_token mesmo em reautorização
    scope: SCOPES,
    state,
  });
}

export function verifyState(state) {
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    return decoded?.professionalId != null ? Number(decoded.professionalId) : null;
  } catch {
    return null;
  }
}

// Troca o code por tokens, lê o e-mail da conta e faz upsert na tabela.
export async function exchangeCodeAndStore(code, professionalId) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    // Sem refresh token não conseguimos operar server-side de forma persistente.
    throw new Error("Google não retornou refresh_token (revogue o acesso e reconecte com prompt=consent).");
  }
  client.setCredentials(tokens);

  let email = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    email = me.data?.email || null;
  } catch (e) {
    gcalLog("userinfo_error", { error: String(e) });
  }

  await pool.query(
    `INSERT INTO google_oauth_tokens (user_id, refresh_token, email, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET refresh_token = EXCLUDED.refresh_token,
           email = EXCLUDED.email,
           sync_token = NULL,
           updated_at = NOW()`,
    [professionalId, tokens.refresh_token, email]
  );
  return { email };
}

async function loadTokenRow(professionalId) {
  const r = await pool.query(
    "SELECT * FROM google_oauth_tokens WHERE user_id = $1",
    [professionalId]
  );
  return r.rows[0] || null;
}

// Client autorizado (auto-refresh do access token) ou null se o profissional não conectou.
export async function getCalendarClient(professionalId) {
  const row = await loadTokenRow(professionalId);
  if (!row) return null;
  const auth = getOAuthClient();
  auth.setCredentials({ refresh_token: row.refresh_token });
  const calendar = google.calendar({ version: "v3", auth });
  return { calendar, auth, calendarId: row.calendar_id || "primary", row };
}

export async function isConnected(professionalId) {
  const row = await loadTokenRow(professionalId);
  return !!row;
}

export async function getStatus(professionalId) {
  const row = await loadTokenRow(professionalId);
  return { connected: !!row, email: row?.email || null };
}

// Remove credenciais quando o token foi revogado/expirou e não há como recuperar.
async function disconnectInternal(professionalId) {
  await pool.query("DELETE FROM google_oauth_tokens WHERE user_id = $1", [professionalId]);
}

// ===== EVENTOS (SAÍDA) =====

function buildEventResource({ summary, description, startUTC, endUTC, isOnline }) {
  const resource = {
    summary,
    description: description || undefined,
    start: { dateTime: new Date(startUTC).toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: new Date(endUTC).toISOString(), timeZone: "America/Sao_Paulo" },
    extendedProperties: { private: { source: EVENT_SOURCE_TAG } },
  };
  if (isOnline) {
    resource.conferenceData = {
      createRequest: {
        requestId: `convenio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  return resource;
}

function extractMeetLink(eventData) {
  if (!eventData) return null;
  if (eventData.hangoutLink) return eventData.hangoutLink;
  const ep = eventData.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
  return ep?.uri || null;
}

// Cria evento no calendário do profissional. Retorna { eventId, meetLink } ou null
// se não conectado. Erros de auth limpam a credencial e retornam null.
export async function createEvent(professionalId, opts) {
  const ctx = await getCalendarClient(professionalId);
  if (!ctx) return null;
  try {
    const res = await ctx.calendar.events.insert({
      calendarId: ctx.calendarId,
      conferenceDataVersion: opts.isOnline ? 1 : 0,
      requestBody: buildEventResource(opts),
    });
    return { eventId: res.data.id, meetLink: extractMeetLink(res.data) };
  } catch (e) {
    await handleApiError(professionalId, e, "createEvent");
    return null;
  }
}

export async function updateEvent(professionalId, eventId, opts) {
  const ctx = await getCalendarClient(professionalId);
  if (!ctx || !eventId) return null;
  try {
    const res = await ctx.calendar.events.patch({
      calendarId: ctx.calendarId,
      eventId,
      conferenceDataVersion: opts.isOnline ? 1 : 0,
      requestBody: buildEventResource(opts),
    });
    return { eventId: res.data.id, meetLink: extractMeetLink(res.data) };
  } catch (e) {
    await handleApiError(professionalId, e, "updateEvent");
    return null;
  }
}

export async function deleteEvent(professionalId, eventId) {
  const ctx = await getCalendarClient(professionalId);
  if (!ctx || !eventId) return false;
  try {
    await ctx.calendar.events.delete({ calendarId: ctx.calendarId, eventId });
    return true;
  } catch (e) {
    // 410/404 = evento já removido no Google; tratar como sucesso.
    const code = e?.code || e?.response?.status;
    if (code === 410 || code === 404) return true;
    await handleApiError(professionalId, e, "deleteEvent");
    return false;
  }
}

// ===== PUSH (events.watch) =====

function webhookAddress() {
  const base = (process.env.GOOGLE_WEBHOOK_URL || process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
  return base ? `${base}/api/google/notifications` : null;
}

// Registra (ou renova) o canal de push para o calendário do profissional.
export async function startWatch(professionalId) {
  const address = webhookAddress();
  if (!address || !address.startsWith("https://")) {
    gcalLog("watch_skipped_no_https", { professionalId, address });
    return null;
  }
  const ctx = await getCalendarClient(professionalId);
  if (!ctx) return null;

  // Cancela o canal anterior, se houver, antes de abrir um novo.
  await stopWatch(professionalId).catch(() => {});

  const channelId = `convenio-${professionalId}-${Date.now()}`;
  const channelToken = jwt.sign({ professionalId }, process.env.JWT_SECRET, { expiresIn: "30d" });
  try {
    const res = await ctx.calendar.events.watch({
      calendarId: ctx.calendarId,
      requestBody: { id: channelId, type: "web_hook", address, token: channelToken },
    });
    await pool.query(
      `UPDATE google_oauth_tokens
          SET watch_channel_id = $2, watch_resource_id = $3, watch_token = $4,
              watch_expiration = $5, updated_at = NOW()
        WHERE user_id = $1`,
      [professionalId, channelId, res.data.resourceId || null, channelToken, res.data.expiration ? Number(res.data.expiration) : null]
    );
    gcalLog("watch_started", { professionalId, channelId, expiration: res.data.expiration });
    return res.data;
  } catch (e) {
    await handleApiError(professionalId, e, "startWatch");
    return null;
  }
}

export async function stopWatch(professionalId) {
  const row = await loadTokenRow(professionalId);
  if (!row?.watch_channel_id || !row?.watch_resource_id) return;
  const ctx = await getCalendarClient(professionalId);
  if (!ctx) return;
  try {
    await ctx.calendar.channels.stop({
      requestBody: { id: row.watch_channel_id, resourceId: row.watch_resource_id },
    });
  } catch (e) {
    gcalLog("stop_watch_error", { professionalId, error: String(e) });
  }
  await pool.query(
    `UPDATE google_oauth_tokens
        SET watch_channel_id = NULL, watch_resource_id = NULL, watch_token = NULL,
            watch_expiration = NULL, updated_at = NOW()
      WHERE user_id = $1`,
    [professionalId]
  );
}

// Desconecta totalmente: para o watch e remove a credencial.
export async function disconnect(professionalId) {
  await stopWatch(professionalId).catch(() => {});
  // Tenta revogar o refresh token no Google.
  try {
    const ctx = await getCalendarClient(professionalId);
    if (ctx) await ctx.auth.revokeCredentials();
  } catch (e) {
    gcalLog("revoke_error", { professionalId, error: String(e) });
  }
  await disconnectInternal(professionalId);
}

// ===== SINCRONIZAÇÃO INCREMENTAL (ENTRADA) =====

// Retorna { events, syncToken } com as mudanças desde o último syncToken.
// Em 410 GONE reseta o syncToken e faz full sync.
export async function listChanges(professionalId) {
  const ctx = await getCalendarClient(professionalId);
  if (!ctx) return { events: [], syncToken: null };

  let syncToken = ctx.row.sync_token || null;
  const events = [];

  const runList = async (token) => {
    let pageToken;
    let newSyncToken = null;
    do {
      const params = {
        calendarId: ctx.calendarId,
        singleEvents: true,
        showDeleted: true,
        maxResults: 250,
      };
      if (token) params.syncToken = token;
      else params.timeMin = new Date().toISOString(); // full sync: só daqui pra frente
      if (pageToken) params.pageToken = pageToken;

      const res = await ctx.calendar.events.list(params);
      for (const ev of res.data.items || []) events.push(ev);
      pageToken = res.data.nextPageToken;
      if (res.data.nextSyncToken) newSyncToken = res.data.nextSyncToken;
    } while (pageToken);
    return newSyncToken;
  };

  try {
    const newSyncToken = await runList(syncToken);
    syncToken = newSyncToken || syncToken;
  } catch (e) {
    const code = e?.code || e?.response?.status;
    if (code === 410) {
      // syncToken expirado → full sync.
      events.length = 0;
      gcalLog("sync_full_reset", { professionalId });
      const newSyncToken = await runList(null);
      syncToken = newSyncToken || null;
    } else {
      await handleApiError(professionalId, e, "listChanges");
      return { events: [], syncToken: ctx.row.sync_token || null };
    }
  }

  if (syncToken) await saveSyncToken(professionalId, syncToken);
  return { events, syncToken };
}

export async function saveSyncToken(professionalId, syncToken) {
  await pool.query(
    "UPDATE google_oauth_tokens SET sync_token = $2, updated_at = NOW() WHERE user_id = $1",
    [professionalId, syncToken]
  );
}

// Profissional associado a um canal de push (push notification → professionalId).
export async function findProfessionalByChannel(channelId, resourceId) {
  const r = await pool.query(
    "SELECT user_id FROM google_oauth_tokens WHERE watch_channel_id = $1 AND watch_resource_id = $2",
    [channelId, resourceId]
  );
  return r.rows[0]?.user_id || null;
}

export function isSystemEvent(ev) {
  return ev?.extendedProperties?.private?.source === EVENT_SOURCE_TAG;
}

// Profissionais com watch perto de expirar (para o cron de renovação).
export async function listChannelsNearExpiry(thresholdMs = 24 * 60 * 60 * 1000) {
  const r = await pool.query(
    `SELECT user_id FROM google_oauth_tokens
      WHERE watch_channel_id IS NOT NULL
        AND (watch_expiration IS NULL OR watch_expiration < $1)`,
    [Date.now() + thresholdMs]
  );
  return r.rows.map((row) => row.user_id);
}

// Trata erro de API; se for invalid_grant (token revogado), desconecta.
async function handleApiError(professionalId, error, op) {
  const data = error?.response?.data;
  const isInvalidGrant =
    error?.message?.includes("invalid_grant") ||
    data?.error === "invalid_grant" ||
    data?.error?.status === "UNAUTHENTICATED";
  gcalLog("api_error", { professionalId, op, error: String(error?.message || error), invalidGrant: !!isInvalidGrant });
  if (isInvalidGrant) {
    await disconnectInternal(professionalId).catch(() => {});
  }
}
