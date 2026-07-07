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

// Diferença em dias entre duas datas "YYYY-MM-DD" (b - a), ignorando fuso/horas.
function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

const WEEKDAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

// Rótulo amigável de um dia: "Hoje (07/07)", "Amanhã (08/07)", "Quinta-feira (10/07)".
function dayLabel(ymd) {
  const diff = daysBetween(todayInBrazil(), ymd);
  const [y, m, d] = ymd.split("-").map(Number);
  const dm = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  if (diff === 0) return `Hoje (${dm})`;
  if (diff === 1) return `Amanhã (${dm})`;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} (${dm})`;
}

// Lista de dias (YYYY-MM-DD, Brasil) a partir de hoje, horizonte = maxDays.
function eachDayYmd(maxDays) {
  const [y, m, d] = todayInBrazil().split("-").map(Number);
  const days = [];
  for (let off = 0; off < maxDays; off++) {
    // Date.UTC lida com overflow de mês/ano ao somar dias
    days.push(new Date(Date.UTC(y, m - 1, d + off)).toISOString().slice(0, 10));
  }
  return days;
}

// Carrega ocupação do profissional no horizonte: consultas ativas (instantes ISO UTC)
// e bloqueios manuais/Google ("YYYY-MM-DD|HH:MM" em horário Brasil).
async function loadOccupancy(professionalId, maxDays) {
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

  return { occupied, blocked };
}

// Gera os horários livres de um único dia (YYYY-MM-DD Brasil), dado o contexto
// de expediente + ocupação já carregado.
function slotsForDay(ymd, ctx) {
  const { startMin, endMin, slotMinutes, nowISO, occupied, blocked } = ctx;
  const out = [];
  for (let minutes = startMin; minutes < endMin; minutes += slotMinutes) {
    const time = minutesToTime(minutes);
    const isoUTC = brazilDateTimeToUTC(ymd, time);
    if (isoUTC <= nowISO) continue; // já passou
    if (occupied.has(isoUTC)) continue; // já agendado
    if (blocked.has(`${ymd}|${time}`)) continue; // bloqueado
    out.push({ dateBrazil: ymd, time, isoUTC });
  }
  return out;
}

async function buildContext(professionalId, maxDays, slotMinutes) {
  const { start, end } = await getWorkingHours(professionalId);
  return {
    startMin: timeToMinutes(start),
    endMin: timeToMinutes(end),
    slotMinutes,
    nowISO: new Date().toISOString(),
    ...(await loadOccupancy(professionalId, maxDays)),
  };
}

/**
 * Dias com pelo menos um horário livre, do mais próximo ao mais distante.
 * @returns {Promise<Array<{ dateBrazil: string, label: string, freeCount: number }>>}
 */
export async function getAvailableDays(
  professionalId,
  { slotMinutes = 30, maxDays = 21, limit = 6 } = {}
) {
  const ctx = await buildContext(professionalId, maxDays, slotMinutes);
  const result = [];
  for (const ymd of eachDayYmd(maxDays)) {
    const free = slotsForDay(ymd, ctx);
    if (free.length > 0) {
      result.push({ dateBrazil: ymd, label: dayLabel(ymd), freeCount: free.length });
      if (result.length >= limit) break;
    }
  }
  return result;
}

/**
 * Horários livres de um dia específico (YYYY-MM-DD, Brasil).
 * @returns {Promise<Array<{ dateBrazil: string, time: string, isoUTC: string }>>}
 */
export async function getFreeSlotsForDay(
  professionalId,
  dateBrazil,
  { slotMinutes = 30 } = {}
) {
  const ctx = await buildContext(professionalId, 21, slotMinutes);
  return slotsForDay(dateBrazil, ctx);
}
