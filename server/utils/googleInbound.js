/**
 * Sincronização de ENTRADA: Google Agenda → sistema.
 *
 * Disparado pelo push (events.watch) via POST /api/google/notifications e pelo
 * cron de reconciliação. Para cada mudança no calendário do profissional:
 *  - Evento do sistema (tag source='convenio') movido  → atualiza consultations.date.
 *  - Evento do sistema cancelado/removido               → cancela a consulta.
 *  - Evento externo (pessoal do profissional)           → vira blocked_slots
 *    (bloqueia a agenda, evitando overbooking); removido → libera os slots.
 *
 * Idempotente: se o estado do Google já bate com o banco, não escreve nada —
 * isso evita loop de eco com a sincronização de saída.
 */

import { pool } from "../db.js";
import { getWorkingHours } from "./agenda.js";
import { listChanges, isSystemEvent } from "./googleCalendar.js";

const SLOT_MS = 30 * 60000;

function inLog(event, data = {}) {
  try {
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), src: "ginbound", event, ...data }) + "\n"
    );
  } catch {
    /* nunca deixar o log quebrar o fluxo */
  }
}

function brazilYmd(ms) {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function brazilHm(ms) {
  return new Date(ms).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Slots de 30 min (alinhados à grade :00/:30) que cobrem [startMs, endMs).
function slotsForRange(startMs, endMs) {
  const out = [];
  let t = Math.floor(startMs / SLOT_MS) * SLOT_MS;
  while (t < endMs) {
    out.push({ ymd: brazilYmd(t), hm: brazilHm(t) });
    t += SLOT_MS;
  }
  return out;
}

// Slots de um evento. Timed: pelo intervalo. All-day: expediente de cada dia.
async function slotsForEvent(professionalId, ev) {
  if (ev.start?.dateTime && ev.end?.dateTime) {
    return slotsForRange(new Date(ev.start.dateTime).getTime(), new Date(ev.end.dateTime).getTime());
  }
  if (ev.start?.date) {
    // Evento de dia inteiro: bloqueia o expediente de cada dia coberto.
    const { start, end } = await getWorkingHours(professionalId);
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const out = [];
    const dayStart = new Date(`${ev.start.date}T00:00:00-03:00`).getTime();
    const dayEndExclusive = new Date(`${ev.end?.date || ev.start.date}T00:00:00-03:00`).getTime();
    for (let d = dayStart; d < Math.max(dayEndExclusive, dayStart + 86400000); d += 86400000) {
      const ymd = brazilYmd(d);
      const from = new Date(`${ymd}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00-03:00`).getTime();
      const to = new Date(`${ymd}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00-03:00`).getTime();
      out.push(...slotsForRange(from, to));
    }
    return out;
  }
  return [];
}

function isCancelled(ev) {
  return ev.status === "cancelled";
}

// Atualiza a consulta vinculada quando o evento do sistema foi movido no Google.
async function reconcileSystemEventMove(professionalId, ev) {
  const r = await pool.query(
    "SELECT id, date FROM consultations WHERE google_event_id = $1 AND professional_id = $2 AND status != 'cancelled'",
    [ev.id, professionalId]
  );
  const consulta = r.rows[0];
  if (!consulta || !ev.start?.dateTime) return;
  const newDateISO = new Date(ev.start.dateTime).toISOString();
  const curDateISO = new Date(consulta.date).toISOString();
  if (newDateISO === curDateISO) return; // sem mudança → evita eco
  await pool.query(
    "UPDATE consultations SET date = $2::timestamptz, updated_at = NOW() WHERE id = $1",
    [consulta.id, newDateISO]
  );
  inLog("consultation_moved", { professionalId, consultationId: consulta.id, date: newDateISO });
}

// Cancela a consulta vinculada quando o evento foi removido no Google.
async function reconcileEventCancel(professionalId, ev) {
  const r = await pool.query(
    `UPDATE consultations
        SET status = 'cancelled', cancelled_at = NOW(),
            cancellation_reason = 'Cancelado no Google Agenda', updated_at = NOW()
      WHERE google_event_id = $1 AND professional_id = $2 AND status != 'cancelled'
      RETURNING id`,
    [ev.id, professionalId]
  );
  if (r.rows.length > 0) {
    inLog("consultation_cancelled_from_google", { professionalId, consultationId: r.rows[0].id });
    return true;
  }
  return false;
}

// Reescreve os blocked_slots de um evento externo (remove os antigos por id e
// reinsere a posição atual). Para eventos removidos, apenas remove.
async function reconcileExternalEvent(professionalId, ev) {
  await pool.query("DELETE FROM blocked_slots WHERE professional_id = $1 AND google_event_id = $2", [
    professionalId,
    ev.id,
  ]);
  if (isCancelled(ev)) return;

  const slots = await slotsForEvent(professionalId, ev);
  if (slots.length === 0) return;
  const reason = (ev.summary || "Google Agenda").slice(0, 200);
  for (const s of slots) {
    // ON CONFLICT DO NOTHING: não sobrescreve bloqueios manuais nem de outros eventos.
    await pool.query(
      `INSERT INTO blocked_slots (professional_id, date, time_slot, reason, google_event_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (professional_id, date, time_slot) DO NOTHING`,
      [professionalId, s.ymd, s.hm, reason, ev.id]
    );
  }
  inLog("external_blocked", { professionalId, eventId: ev.id, slots: slots.length });
}

// Ponto de entrada: processa todas as mudanças pendentes do profissional.
export async function pullGoogleChanges(professionalId) {
  let result;
  try {
    result = await listChanges(professionalId);
  } catch (e) {
    inLog("list_changes_error", { professionalId, error: String(e) });
    return;
  }
  const { events } = result;
  for (const ev of events) {
    try {
      if (isCancelled(ev)) {
        // Pode ser cancelamento de evento do sistema (cancela consulta) ou de
        // evento externo (libera blocked_slots). Tenta consulta primeiro.
        const handled = await reconcileEventCancel(professionalId, ev);
        if (!handled) await reconcileExternalEvent(professionalId, ev);
        continue;
      }
      if (isSystemEvent(ev)) {
        await reconcileSystemEventMove(professionalId, ev);
      } else {
        await reconcileExternalEvent(professionalId, ev);
      }
    } catch (e) {
      inLog("event_error", { professionalId, eventId: ev?.id, error: String(e) });
    }
  }
  inLog("pull_done", { professionalId, count: events.length });
}
