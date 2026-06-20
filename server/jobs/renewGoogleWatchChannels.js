/**
 * Renovação dos canais de push do Google Calendar (events.watch).
 *
 * Os canais expiram (tipicamente em dias); o Google para de notificar após a
 * expiração. Este job, a cada 6 horas, re-registra os canais perto de expirar e
 * faz um pull de reconciliação (rede de segurança caso algum push tenha falhado).
 */

import cron from "node-cron";
import { isGoogleConfigured, startWatch, listChannelsNearExpiry } from "../utils/googleCalendar.js";
import { pullGoogleChanges } from "../utils/googleInbound.js";

async function renewNow() {
  if (!isGoogleConfigured()) return;
  try {
    const professionalIds = await listChannelsNearExpiry();
    for (const professionalId of professionalIds) {
      try {
        await startWatch(professionalId); // re-registra (cancela o anterior internamente)
        await pullGoogleChanges(professionalId);
      } catch (e) {
        console.error("❌ [CRON google-watch] professional", professionalId, e);
      }
    }
    if (professionalIds.length > 0) {
      console.log(`[CRON] Renovados ${professionalIds.length} canal(is) Google Calendar.`);
    }
  } catch (e) {
    console.error("❌ [CRON google-watch]", e);
  }
}

export function scheduleGoogleWatchRenewal() {
  // A cada 6 horas.
  cron.schedule("0 */6 * * *", renewNow);
}
