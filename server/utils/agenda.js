/**
 * Helpers compartilhados de agenda — usados pelas rotas de consulta em index.js
 * e pela Secretária Virtual (server/whatsapp.js).
 *
 * Padrão de fuso do projeto: o banco guarda timestamptz em UTC; o expediente do
 * profissional (agenda_start_time/agenda_end_time) é em horário de Brasília.
 * O Brasil não adota horário de verão desde 2019, então usamos o offset fixo
 * -03:00 para converter um horário local em UTC.
 */

import { pool } from "../db.js";
import { formatToBrazilTimeOnly } from "./dateHelpers.js";

export const DEFAULT_WORKING_START = "07:00";
export const DEFAULT_WORKING_END = "18:00";

const BRAZIL_UTC_OFFSET = "-03:00";

export async function getWorkingHours(professionalId) {
  const result = await pool.query(
    "SELECT agenda_start_time, agenda_end_time FROM users WHERE id = $1",
    [professionalId]
  );
  const row = result.rows[0] || {};
  return {
    start: row.agenda_start_time || DEFAULT_WORKING_START,
    end: row.agenda_end_time || DEFAULT_WORKING_END,
  };
}

// Verifica se o horário (UTC) cai dentro do expediente, comparando no fuso do Brasil
export function isWithinWorkingHours(dateUTC, { start, end }) {
  const time = formatToBrazilTimeOnly(dateUTC); // "HH:MM"
  if (!time) return false;
  return time >= start && time < end;
}

function timeToMinutes(time) {
  const [h, m] = String(time).split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Data de hoje no fuso do Brasil, "YYYY-MM-DD"
function todayInBrazil() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

// Converte um dia (YYYY-MM-DD, Brasil) + hora (HH:MM, Brasil) para ISO UTC
function brazilDateTimeToUTC(ymd, time) {
  return new Date(`${ymd}T${time}:00${BRAZIL_UTC_OFFSET}`).toISOString();
}

/**
 * Gera os próximos horários livres do profissional.
 * @param {number} professionalId
 * @param {object} [opts]
 * @param {number} [opts.slotMinutes=30] duração de cada slot
 * @param {number} [opts.maxSlots=5] quantos slots retornar
 * @param {number} [opts.maxDays=14] horizonte de busca em dias
 * @returns {Promise<Array<{ dateBrazil: string, time: string, isoUTC: string }>>}
 */
export async function getFreeSlots(
  professionalId,
  { slotMinutes = 30, maxSlots = 5, maxDays = 14 } = {}
) {
  const { start, end } = await getWorkingHours(professionalId);
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  const nowISO = new Date().toISOString();

  // Consultas ativas no horizonte → conjunto de instantes ocupados (ISO UTC)
  const occupied = new Set();
  const consultas = await pool.query(
    `SELECT date FROM consultations
       WHERE professional_id = $1
         AND status != 'cancelled'
         AND date >= NOW()
         AND date < NOW() + ($2 * INTERVAL '1 day')`,
    [professionalId, maxDays]
  );
  for (const row of consultas.rows) {
    occupied.add(new Date(row.date).toISOString());
  }

  // Horários bloqueados manualmente → conjunto "YYYY-MM-DD|HH:MM" (horário Brasil)
  const blocked = new Set();
  const bloqueios = await pool.query(
    `SELECT date, time_slot FROM blocked_slots
       WHERE professional_id = $1 AND date >= CURRENT_DATE`,
    [professionalId]
  );
  for (const row of bloqueios.rows) {
    const ymd = new Date(row.date).toISOString().slice(0, 10);
    const time = String(row.time_slot).slice(0, 5);
    blocked.add(`${ymd}|${time}`);
  }

  const todayBR = todayInBrazil();
  const [y, m, d] = todayBR.split("-").map(Number);
  const slots = [];

  for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
    // Date.UTC lida com overflow de mês/ano ao somar dias
    const ymd = new Date(Date.UTC(y, m - 1, d + dayOffset))
      .toISOString()
      .slice(0, 10);

    for (let minutes = startMin; minutes < endMin; minutes += slotMinutes) {
      const time = minutesToTime(minutes);
      const isoUTC = brazilDateTimeToUTC(ymd, time);

      if (isoUTC <= nowISO) continue; // já passou
      if (occupied.has(isoUTC)) continue; // já agendado
      if (blocked.has(`${ymd}|${time}`)) continue; // bloqueado

      slots.push({ dateBrazil: ymd, time, isoUTC });
      if (slots.length >= maxSlots) return slots;
    }
  }

  return slots;
}
