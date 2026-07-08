/**
 * Sincronização de SAÍDA: consulta do sistema → evento no Google Agenda.
 *
 * Chamado após o commit de criação/remarcação/cancelamento de consulta, tanto
 * pelo painel (server/index.js) quanto pelo bot (server/whatsapp.js). Nunca
 * propaga erro: falha no Google é logada e o agendamento segue normalmente.
 *
 * A modalidade (online → gera Meet) é derivada de services.is_online via JOIN —
 * não há coluna de modalidade em consultations.
 */

import { pool } from "../db.js";
import { createEvent, updateEvent, deleteEvent } from "./googleCalendar.js";

// Duração padrão do evento (mesmo slot de 30 min usado em utils/agenda.js).
const SLOT_MINUTES = 30;

function syncLog(event, data = {}) {
  try {
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), src: "csync", event, ...data }) + "\n"
    );
  } catch {
    /* nunca deixar o log quebrar o fluxo */
  }
}

// Carrega os dados da consulta necessários para montar o evento.
async function loadConsultation(consultationId) {
  const r = await pool.query(
    `SELECT c.id, c.date, c.notes, c.status, c.professional_id,
            c.google_event_id, c.google_meet_link,
            s.name AS service_name, COALESCE(s.is_online, false) AS is_online,
            COALESCE(u.name, dep.name, pp.name) AS patient_name
       FROM consultations c
       LEFT JOIN services s ON c.service_id = s.id
       LEFT JOIN users u ON c.user_id = u.id
       LEFT JOIN dependents dep ON c.dependent_id = dep.id
       LEFT JOIN private_patients pp ON c.private_patient_id = pp.id
      WHERE c.id = $1`,
    [consultationId]
  );
  return r.rows[0] || null;
}

function buildEventOpts(row) {
  const startUTC = new Date(row.date).toISOString();
  const endUTC = new Date(new Date(row.date).getTime() + SLOT_MINUTES * 60000).toISOString();
  const patient = row.patient_name || "Paciente";
  const service = row.service_name || "Consulta";
  const summary = `${patient} — ${service}${row.is_online ? " (Online)" : ""}`;
  return {
    summary,
    description: row.notes || undefined,
    startUTC,
    endUTC,
    isOnline: !!row.is_online,
  };
}

async function storeEventRef(consultationId, eventId, meetLink) {
  await pool.query(
    "UPDATE consultations SET google_event_id = $2, google_meet_link = $3 WHERE id = $1",
    [consultationId, eventId || null, meetLink || null]
  );
}

// Cria o evento no Google. Retorna o meetLink (ou null) — usado pelo bot para
// enviar o link da consulta online ao paciente.
export async function syncCreateEvent(consultationId) {
  try {
    const row = await loadConsultation(consultationId);
    if (!row) return null;
    const result = await createEvent(row.professional_id, buildEventOpts(row));
    if (result?.eventId) {
      await storeEventRef(consultationId, result.eventId, result.meetLink);
      syncLog("event_created", { consultationId, eventId: result.eventId, online: row.is_online });
      return result.meetLink || null;
    }
    return null;
  } catch (e) {
    syncLog("create_error", { consultationId, error: String(e) });
    return null;
  }
}

// Atualiza o evento existente (horário/modalidade). Cria se ainda não houver vínculo.
export async function syncUpdateEvent(consultationId) {
  try {
    const row = await loadConsultation(consultationId);
    if (!row) return null;
    const opts = buildEventOpts(row);
    if (row.google_event_id) {
      const result = await updateEvent(row.professional_id, row.google_event_id, opts);
      if (result?.eventId) {
        await storeEventRef(consultationId, result.eventId, result.meetLink);
        syncLog("event_updated", { consultationId, eventId: result.eventId });
        return result.meetLink || null;
      }
      return row.google_meet_link || null;
    }
    // Sem vínculo prévio (ex.: profissional conectou depois): cria agora.
    return await syncCreateEvent(consultationId);
  } catch (e) {
    syncLog("update_error", { consultationId, error: String(e) });
    return null;
  }
}

// Apaga o evento no Google e limpa o vínculo na consulta.
export async function syncCancelEvent(consultationId) {
  try {
    const row = await loadConsultation(consultationId);
    if (!row || !row.google_event_id) return;
    await deleteEvent(row.professional_id, row.google_event_id);
    await storeEventRef(consultationId, null, null);
    syncLog("event_cancelled", { consultationId });
  } catch (e) {
    syncLog("cancel_error", { consultationId, error: String(e) });
  }
}

// Variante que recebe o google_event_id explicitamente — usada antes de um DELETE
// físico, quando a linha (e o id) deixará de existir.
export async function syncDeleteEventById(professionalId, googleEventId) {
  try {
    if (!professionalId || !googleEventId) return;
    await deleteEvent(professionalId, googleEventId);
    syncLog("event_deleted_by_id", { professionalId });
  } catch (e) {
    syncLog("delete_by_id_error", { error: String(e) });
  }
}
