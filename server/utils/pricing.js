/**
 * Preços do Convênio Quiro Ferreira — fonte única de verdade.
 *
 * Os valores ficam em `system_settings` (chaves `subscription_price` e
 * `dependent_price`) e são editáveis pelo painel admin, sem mexer em código nem
 * fazer deploy. Este módulo mantém um cache em processo para que o prompt da
 * Secretária e o checkout leiam o valor de forma síncrona e barata.
 *
 * Antes disso o preço estava duplicado no checkout e nos textos da IA, o que já
 * causou divergência real: o sistema cobrava R$350 enquanto a secretária
 * anunciava R$600. Qualquer mudança de preço agora acontece no painel.
 *
 * O front (`src/pages/client/PaymentSection.tsx`) lê os mesmos valores pela rota
 * pública `GET /api/pricing`.
 */

import { pool } from "../db.js";

// Usados como semente na primeira carga e como rede de segurança se o banco
// estiver indisponível — nunca como fonte de verdade depois do boot.
export const DEFAULT_HOLDER_PRICE = 350.0;
export const DEFAULT_DEPENDENT_PRICE = 100.0;

const HOLDER_KEY = "subscription_price";
const DEPENDENT_KEY = "dependent_price";

let cache = {
  holder: DEFAULT_HOLDER_PRICE,
  dependent: DEFAULT_DEPENDENT_PRICE,
  loaded: false,
};

function parsePrice(raw, fallback) {
  const n = Number(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Carrega os preços do banco para o cache. Chamado no boot e após cada edição.
 * Se o banco falhar, mantém o que já estava em cache (ou os defaults).
 */
export async function loadPricing() {
  try {
    const r = await pool.query(
      `SELECT key, value FROM system_settings WHERE key = ANY($1::text[])`,
      [[HOLDER_KEY, DEPENDENT_KEY]]
    );
    const byKey = Object.fromEntries(r.rows.map((row) => [row.key, row.value]));
    cache = {
      holder: parsePrice(byKey[HOLDER_KEY], DEFAULT_HOLDER_PRICE),
      dependent: parsePrice(byKey[DEPENDENT_KEY], DEFAULT_DEPENDENT_PRICE),
      loaded: true,
    };
  } catch (e) {
    console.error("❌ [pricing] falha ao carregar preços, mantendo cache:", e.message);
  }
  return { ...cache };
}

/** Preço anual do titular (R$). Síncrono — lê do cache. */
export function getHolderPrice() {
  return cache.holder;
}

/** Preço anual por dependente (R$). Síncrono — lê do cache. */
export function getDependentPrice() {
  return cache.dependent;
}

export function getPricing() {
  return { holder: cache.holder, dependent: cache.dependent, loaded: cache.loaded };
}

/**
 * Grava um preço e recarrega o cache. `updatedBy` fica registrado na tabela.
 */
export async function setPricing({ holder, dependent, updatedBy = null }) {
  const updates = [];
  if (holder != null) updates.push([HOLDER_KEY, holder, "Valor anual do titular do Convênio Quiro Ferreira (R$)"]);
  if (dependent != null) updates.push([DEPENDENT_KEY, dependent, "Valor anual por dependente do Convênio Quiro Ferreira (R$)"]);

  for (const [key, value, description] of updates) {
    await pool.query(
      `INSERT INTO system_settings (key, value, description, updated_by, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value,
                     description = EXCLUDED.description,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = NOW()`,
      [key, String(value), description, updatedBy]
    );
  }
  return loadPricing();
}

// "R$ 350,00" — para uso direto nos textos da secretária.
export function formatPriceBRL(v) {
  return `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
}

// Valor mensal equivalente, arredondado para cima na dezena — usado no argumento
// de venda ("menos de R$ 30 por mês"). Nunca subestima o valor real.
export function monthlyEquivalentCeil(annual = getHolderPrice()) {
  return Math.ceil(Number(annual) / 12 / 10) * 10;
}
