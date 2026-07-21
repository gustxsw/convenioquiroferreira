/**
 * Preços do Convênio Quiro Ferreira — fonte única de verdade.
 *
 * Estes valores eram repetidos no checkout (`server/index.js`) e nos textos da
 * Secretária Virtual (`server/whatsapp.js`). Isso já causou divergência real: o
 * checkout foi ajustado para R$350 numa branch enquanto a secretária continuava
 * anunciando R$600 — ou seja, a IA venderia por um valor que o sistema não cobra.
 * Qualquer mudança de preço acontece AQUI e se propaga para os dois lados.
 *
 * O front (`src/pages/client/PaymentSection.tsx`) não importa deste módulo (é
 * bundle de browser) — ao mudar o valor aqui, ajuste o `baseAmount` de lá junto.
 */

// Assinatura anual do titular (R$).
export const SUBSCRIPTION_HOLDER_PRICE = 350.0;

// Assinatura anual por dependente (R$).
export const SUBSCRIPTION_DEPENDENT_PRICE = 100.0;

// "R$ 350,00" — para uso direto nos textos da secretária.
export function formatPriceBRL(v) {
  return `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
}

// Valor mensal equivalente, arredondado para cima na dezena — usado no argumento
// de venda ("menos de R$ 30 por mês"). Nunca subestima o valor real.
export function monthlyEquivalentCeil(annual = SUBSCRIPTION_HOLDER_PRICE) {
  return Math.ceil(Number(annual) / 12 / 10) * 10;
}
