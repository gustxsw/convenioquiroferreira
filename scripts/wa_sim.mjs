// Harness de conversa com a Secretária Virtual — DRY RUN.
// Injeta uma mensagem de paciente direto no núcleo (processInbound), como se
// tivesse chegado pelo número 556499876597 (profissional 2). O envio real falha
// de propósito (Baileys não conectado neste processo) e é capturado, mas a
// resposta do bot É registrada no banco — então lemos de lá. Nenhuma mensagem
// real sai. Idempotência garantida por messageId único.
//
// Uso: node scripts/wa_sim.mjs <phone> "<texto>"
//   phone: telefone de teste (dígitos, com DDI). Ex.: 5511987650001
import 'dotenv/config';
import { pool } from '../server/db.js';
import { processInbound } from '../server/whatsapp.js';

const phone = process.argv[2];
const text = process.argv[3];
const type = process.argv[4] || 'text'; // opcional: 'audio', 'image', etc. (simula mídia)
if (!phone || text == null) {
  console.error('Uso: node scripts/wa_sim.mjs <phone> "<texto>" [tipo]');
  process.exit(1);
}

const messageId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const startedAt = new Date();

console.log(`\n⬅️  [${phone}] paciente (${type}): ${text}`);

await processInbound({
  phone,
  messageId,
  type,
  textBody: type === 'text' ? text : '',
  phoneNumberId: null,
  displayNumber: '556499876597',
});

// pequena folga para qualquer escrita assíncrona pendente
await new Promise((r) => setTimeout(r, 300));

const out = await pool.query(
  `SELECT actor, intent, step, text
     FROM whatsapp_messages
    WHERE phone = $1 AND direction = 'outbound' AND created_at >= $2
    ORDER BY created_at ASC`,
  [phone, startedAt]
);

if (out.rows.length === 0) {
  console.log('➡️  bot: (sem resposta — silêncio/handoff/bloqueio)');
} else {
  for (const r of out.rows) {
    const meta = [r.intent, r.step].filter(Boolean).join('/');
    console.log(`➡️  bot(${r.actor})${meta ? ' {' + meta + '}' : ''}: ${r.text}`);
  }
}

await pool.end();
