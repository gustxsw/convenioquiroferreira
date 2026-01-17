/**
 * Utilitários para conversão de timezone entre Brasil (UTC-3) e UTC
 * Estas funções são independentes do timezone do navegador
 */

/**
 * Converte uma data/hora do Brasil (UTC-3) para UTC
 * @param dateStr Data no formato YYYY-MM-DD
 * @param timeStr Hora no formato HH:mm ou HH:mm:ss
 * @returns String ISO em UTC (ex: "2024-01-15T21:00:00.000Z")
 */
export function brazilToUTC(dateStr: string, timeStr: string): string {
  // Garante que o tempo tenha segundos
  const timeWithSeconds =
    timeStr.includes(":") && timeStr.split(":").length === 2
      ? `${timeStr}:00`
      : timeStr;

  // Cria a string no formato ISO com timezone do Brasil
  const brazilDateTimeStr = `${dateStr}T${timeWithSeconds}-03:00`;

  // Converte para UTC
  const date = new Date(brazilDateTimeStr);

  if (isNaN(date.getTime())) {
    throw new Error(`Data inválida: ${brazilDateTimeStr}`);
  }

  return date.toISOString();
}

/**
 * Converte uma data/hora UTC para o horário do Brasil (UTC-3)
 * @param utcDateStr String ISO em UTC (ex: "2024-01-15T21:00:00.000Z")
 * @returns Objeto com date (YYYY-MM-DD) e time (HH:mm)
 */
export function utcToBrazil(utcDateStr: string): {
  date: string;
  time: string;
} {
  const date = new Date(utcDateStr);

  if (isNaN(date.getTime())) {
    throw new Error(`Data UTC inválida: ${utcDateStr}`);
  }

  // Pega o timestamp UTC e subtrai 3 horas (em milissegundos)
  const brazilTimestamp = date.getTime() - 3 * 60 * 60 * 1000;
  const brazilDate = new Date(brazilTimestamp);

  // Extrai data e hora usando UTC (para evitar conversão do navegador)
  const year = brazilDate.getUTCFullYear();
  const month = String(brazilDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(brazilDate.getUTCDate()).padStart(2, "0");
  const hours = String(brazilDate.getUTCHours()).padStart(2, "0");
  const minutes = String(brazilDate.getUTCMinutes()).padStart(2, "0");

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

/**
 * Formata uma data UTC para exibição no formato brasileiro
 * @param utcDateStr String ISO em UTC
 * @returns String formatada (ex: "15/01/2024 18:00")
 */
export function formatBrazilDateTime(utcDateStr: string): string {
  const { date, time } = utcToBrazil(utcDateStr);
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year} ${time}`;
}

/**
 * Formata apenas a data no formato brasileiro
 * @param utcDateStr String ISO em UTC
 * @returns String formatada (ex: "15/01/2024")
 */
export function formatBrazilDate(utcDateStr: string): string {
  const { date } = utcToBrazil(utcDateStr);
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Formata apenas a hora no formato brasileiro
 * @param utcDateStr String ISO em UTC
 * @returns String formatada (ex: "18:00")
 */
export function formatBrazilTime(utcDateStr: string): string {
  const { time } = utcToBrazil(utcDateStr);
  return time;
}
