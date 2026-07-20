// Inspetor de conversa do bot de WhatsApp (leitura do banco de produção).
// Uso: node scripts/wa_inspect.mjs [telefone_ultimos_digitos] [limite]
// Sem args: mostra o último telefone que falou com o bot.
import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const arg = process.argv[2] || null;
const limit = Number(process.argv[3]) || 30;

async function pickPhone() {
  if (arg) {
    const r = await pool.query(
      `SELECT phone FROM whatsapp_messages WHERE phone LIKE $1 ORDER BY created_at DESC LIMIT 1`,
      [`%${arg}`]
    );
    return r.rows[0]?.phone || null;
  }
  const r = await pool.query(`SELECT phone FROM whatsapp_messages ORDER BY created_at DESC LIMIT 1`);
  return r.rows[0]?.phone || null;
}

const phone = await pickPhone();
if (!phone) { console.log('Nenhuma mensagem encontrada.'); await pool.end(); process.exit(0); }

console.log(`\n📱 Conversa com ${phone} (últimas ${limit}):\n`);
const msgs = await pool.query(
  `SELECT created_at, direction, actor, intent, step, LEFT(text, 240) AS text
     FROM whatsapp_messages WHERE phone = $1 ORDER BY created_at DESC LIMIT $2`,
  [phone, limit]
);
for (const m of msgs.rows.reverse()) {
  const arrow = m.direction === 'inbound' ? '⬅️  paciente' : `➡️  bot(${m.actor})`;
  const meta = [m.intent, m.step].filter(Boolean).join('/');
  const t = new Date(m.created_at).toLocaleTimeString('pt-BR');
  console.log(`[${t}] ${arrow}${meta ? ' {' + meta + '}' : ''}: ${m.text ?? ''}`);
}

const audit = await pool.query(
  `SELECT created_at, actor, action, LEFT(detail::text, 200) AS detail
     FROM whatsapp_audit_log WHERE phone = $1 ORDER BY created_at DESC LIMIT 15`,
  [phone]
);
if (audit.rows.length) {
  console.log('\n🧾 Auditoria (ações):');
  for (const a of audit.rows.reverse()) {
    console.log(`  [${new Date(a.created_at).toLocaleTimeString('pt-BR')}] ${a.actor} -> ${a.action}${a.detail ? ' ' + a.detail : ''}`);
  }
}

const usage = await pool.query(
  `SELECT COUNT(*)::int AS chamadas, COALESCE(SUM(input_tokens),0)::int AS in_tok, COALESCE(SUM(output_tokens),0)::int AS out_tok
     FROM whatsapp_ai_usage WHERE phone = $1`,
  [phone]
);
console.log('\n💰 Uso de IA nesta conversa:', usage.rows[0]);

await pool.end();
