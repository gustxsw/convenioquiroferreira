import { ls } from "./storage";

/** Dígitos padrão: +55 64 98121-0313 */
const FALLBACK_WHATSAPP_DIGITS = "5564981210313";

export const CONVENIO_OWNER_DISPLAY_PHONE = "+55 64 98121-0313";

export const CONVENIO_PROMO_TITLE =
  "Amplie seus atendimentos com o Convênio Quiro Ferreira";

export const CONVENIO_PROMO_SUBTITLE =
  "Receba pacientes da rede e aumente sua presença entre titulares e dependentes.";

export const CONVENIO_PROMO_CTA_LINE =
  "Quer fazer parte da rede credenciada? Fale com nossa equipe.";

export const AGENDA_ONLY_CONVENIO_SNOOZE_KEY =
  "agenda_only_convenio_banner_snooze_until";

export const AGENDA_ONLY_CONVENIO_SNOOZE_EVENT = "agenda_only_convenio_snooze";

const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export function getConvenioWhatsappDigits(): string {
  const raw = import.meta.env.VITE_WHATSAPP_CONVENIO_OWNER as
    | string
    | undefined;
  const fromEnv = raw?.replace(/\D/g, "") ?? "";
  return fromEnv || FALLBACK_WHATSAPP_DIGITS;
}

export function getConvenioWhatsappPrefillText(): string {
  return "Olá! Sou profissional da agenda e tenho interesse em fazer parte da rede credenciada do Convênio Quiro Ferreira. Gostaria de conversar sobre os próximos passos.";
}

export function getConvenioWhatsappHref(): string {
  const digits = getConvenioWhatsappDigits();
  const text = encodeURIComponent(getConvenioWhatsappPrefillText());
  return `https://wa.me/${digits}?text=${text}`;
}

export function getConvenioTelHref(): string {
  return `tel:+${getConvenioWhatsappDigits()}`;
}

export function isAgendaOnlyConvenioPromoSnoozed(): boolean {
  const raw = ls.get(AGENDA_ONLY_CONVENIO_SNOOZE_KEY);
  if (!raw) return false;
  const until = Number.parseInt(raw, 10);
  if (Number.isNaN(until)) return false;
  return Date.now() < until;
}

export function snoozeAgendaOnlyConvenioPromo(): void {
  const until = Date.now() + SNOOZE_MS;
  ls.set(AGENDA_ONLY_CONVENIO_SNOOZE_KEY, String(until));
  window.dispatchEvent(new Event(AGENDA_ONLY_CONVENIO_SNOOZE_EVENT));
}
