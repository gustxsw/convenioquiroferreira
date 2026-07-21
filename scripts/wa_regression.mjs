// Bateria de regressão da Secretária Virtual (dry-run). Dirige conversas reais
// (cada mensagem em processo isolado via wa_sim.mjs, pra não acionar o guard de
// burst) e ASSERE o resultado no banco — fonte da verdade. Ao final, resumo PASS/FAIL.
//
// Pré-requisito: existir o conveniado de teste (cpf 99900011122).
// Uso: node scripts/wa_regression.mjs
import 'dotenv/config';
import { execFileSync } from 'child_process';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const CONV_CPF = '99900011122';   // conveniado ativo (resolvido pelo CPF)
const PART_CPF = '99900022233';   // particular (cadastrado pelo bot na 1ª vez)
const CLAIM_WORDS_RE = /✅|agendad|marcad|remarcad|cancelad|confirmad/i;
// "Posso confirmar assim?" e "✅ Confirmo o horário?" são PERGUNTAS, não afirmações
// de que a ação foi feita — casá-las como "claim" produzia falso alarme de
// confirmação falsa (o teste acusava mentira onde o bot só estava perguntando).
const CLAIM_RE = {
  test: (txt) => {
    const s = String(txt || '').trim();
    if (!CLAIM_WORDS_RE.test(s)) return false;
    if (/\?\s*$/.test(s)) return false;                  // termina perguntando
    if (/\b(posso|quer|deseja|confirmo\?)\b/i.test(s) && /\?/.test(s)) return false;
    return true;
  },
};

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✅ PASS' : '❌ FAIL'} — ${name}${detail ? `  (${detail})` : ''}`);
}

function send(phone, text) {
  try {
    const out = execFileSync('node', ['scripts/wa_sim.mjs', phone, text], { encoding: 'utf8', timeout: 60000 });
    const bot = out.split('\n').filter((l) => l.includes('bot(')).map((l) => l.replace(/.*bot\([^)]*\)[^:]*:\s*/, '')).join(' ');
    return bot.trim();
  } catch (e) {
    return `[ERRO harness: ${e.message}]`;
  }
}
const q = (sql, p = []) => pool.query(sql, p).then((r) => r.rows);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolve o conveniado de teste pelo CPF em vez de id fixo: o fixture já foi
// apagado do banco uma vez e todos os cenários de convênio falharam por isso,
// mascarados como "regressão".
const CONV_USER_ID = (
  await q(`SELECT id FROM users WHERE cpf = $1`, [CONV_CPF])
)[0]?.id;
if (!CONV_USER_ID) {
  console.error(
    `\n⚠️  Fixture ausente: nenhum usuário com CPF ${CONV_CPF}. ` +
      `Os cenários de convênio (S1, S2, S5, S6) vão falhar por falta de dado, não por regressão.\n`
  );
}

async function convConsult(userId = CONV_USER_ID) {
  return (await q(`SELECT id,service_id,value::float,convenio,date,status FROM consultations WHERE professional_id=2 AND user_id=$1 ORDER BY created_at DESC`, [userId]));
}
async function partConsult(cpf) {
  return (await q(`SELECT c.id,c.service_id,c.value::float,c.convenio,c.date,c.status FROM consultations c JOIN private_patients p ON p.id=c.private_patient_id WHERE c.professional_id=2 AND p.cpf=$1 ORDER BY c.created_at DESC`, [cpf]));
}

// Estado de execuções anteriores fazia a bateria mentir nos dois sentidos: cenários
// "passavam" achando consultas de runs antigos e "falhavam" por sessão/contato
// poluídos. Zeramos tudo que pertence aos números e CPFs de teste antes de começar.
async function resetTestState() {
  const phones = ['5531000000001', '5531000000002', '5531000000003', '5531000000004'];
  await q(`DELETE FROM consultations WHERE user_id = $1`, [CONV_USER_ID || -1]);
  await q(
    `DELETE FROM consultations WHERE private_patient_id IN (SELECT id FROM private_patients WHERE cpf = $1)`,
    [PART_CPF]
  );
  await q(`DELETE FROM private_patients WHERE cpf = $1`, [PART_CPF]);
  await q(`DELETE FROM whatsapp_contacts WHERE phone = ANY($1)`, [phones]);
  await q(`DELETE FROM whatsapp_sessions WHERE phone = ANY($1)`, [phones]);
  console.log('🧹 Estado de teste zerado (consultas, paciente particular, contatos e sessões).');
}
await resetTestState();

console.log('\n================ BATERIA DE REGRESSÃO ================\n');

// ---------- S1: Agendar CONVÊNIO presencial (146, R$120) ----------
console.log('\n### S1 — Convênio presencial (esperado serviço 146, R$120)');
send('5531000000001', 'oi, boa tarde! quero agendar uma consulta');
send('5531000000001', `meu cpf é ${CONV_CPF}`);
send('5531000000001', 'quero a Consulta presencial normal, no dia 23 de julho às 8h');
let r1 = send('5531000000001', 'sim, confirmo o agendamento');
if (!CLAIM_RE.test(r1)) r1 = send('5531000000001', 'pode finalizar o agendamento agora, por favor');
let c1 = (await convConsult()).find((c) => c.status === 'scheduled');
check('S1 consulta criada no banco', !!c1, c1 ? `id=${c1.id}` : 'nenhuma');
if (c1) {
  check('S1 serviço = 146 (presencial)', c1.service_id === 146, `svc=${c1.service_id}`);
  check('S1 valor = 120 (convênio)', c1.value === 120, `R$${c1.value}`);
  check('S1 convenio = Quiro Ferreira', c1.convenio === 'Quiro Ferreira', String(c1.convenio));
}
check('S1 sem confirmação falsa (afirmou ⇔ existe no banco)', CLAIM_RE.test(r1) === !!c1, `claim=${CLAIM_RE.test(r1)} db=${!!c1}`);

// ---------- S2: Agendar CONVÊNIO teleconsulta (167, R$100) ----------
console.log('\n### S2 — Convênio teleconsulta (esperado serviço 167, R$100)');
send('5531000000002', 'oi quero marcar uma teleconsulta online');
send('5531000000002', `cpf ${CONV_CPF}`);
send('5531000000002', 'no dia 23 de julho às 9h');
let r2 = send('5531000000002', 'sim, confirmo');
if (!CLAIM_RE.test(r2)) r2 = send('5531000000002', 'pode finalizar agora por favor');
let c2 = (await convConsult()).find((c) => c.service_id === 167 && c.status === 'scheduled');
check('S2 teleconsulta criada', !!c2, c2 ? `id=${c2.id}` : 'nenhuma');
if (c2) {
  check('S2 serviço = 167 (online)', c2.service_id === 167, `svc=${c2.service_id}`);
  check('S2 valor = 100 (convênio online)', c2.value === 100, `R$${c2.value}`);
}
check('S2 sem confirmação falsa', CLAIM_RE.test(r2) === !!c2, `claim=${CLAIM_RE.test(r2)} db=${!!c2}`);

// ---------- S3: Agendar PARTICULAR presencial (146, R$150) ----------
console.log('\n### S3 — Particular presencial (esperado serviço 146, R$150)');
send('5531000000003', 'oi quero agendar uma consulta');
send('5531000000003', `cpf ${PART_CPF}`);
send('5531000000003', 'meu nome é Roberto Regressao Particular');
send('5531000000003', 'consulta presencial, dia 23 de julho às 10h');
let r3 = send('5531000000003', 'sim, confirmo');
if (!CLAIM_RE.test(r3)) r3 = send('5531000000003', 'pode finalizar o agendamento agora');
let c3 = (await partConsult(PART_CPF)).find((c) => c.service_id === 146 && c.status === 'scheduled');
check('S3 consulta particular criada', !!c3, c3 ? `id=${c3.id}` : 'nenhuma');
if (c3) {
  check('S3 serviço = 146', c3.service_id === 146, `svc=${c3.service_id}`);
  check('S3 valor = 150 (particular)', c3.value === 150, `R$${c3.value}`);
  check('S3 convenio nulo (particular)', c3.convenio == null, String(c3.convenio));
}
check('S3 sem confirmação falsa', CLAIM_RE.test(r3) === !!c3, `claim=${CLAIM_RE.test(r3)} db=${!!c3}`);

// ---------- S4: Agendar PARTICULAR teleconsulta (167, R$135) ----------
console.log('\n### S4 — Particular teleconsulta (esperado serviço 167, R$135)');
send('5531000000004', 'oi quero uma teleconsulta online');
send('5531000000004', `cpf ${PART_CPF}`);
send('5531000000004', 'no dia 23 de julho às 11h');
let r4 = send('5531000000004', 'sim, confirmo');
if (!CLAIM_RE.test(r4)) r4 = send('5531000000004', 'pode finalizar agora por favor');
let c4 = (await partConsult(PART_CPF)).find((c) => c.service_id === 167 && c.status === 'scheduled');
check('S4 teleconsulta particular criada', !!c4, c4 ? `id=${c4.id}` : 'nenhuma');
if (c4) check('S4 valor = 135 (particular online)', c4.value === 135, `R$${c4.value}`);
check('S4 sem confirmação falsa', CLAIM_RE.test(r4) === !!c4, `claim=${CLAIM_RE.test(r4)} db=${!!c4}`);

// ---------- S5: REMARCAR a consulta convênio da S1 ----------
console.log('\n### S5 — Remarcar (convênio, S1 → 24/07 14h)');
const beforeDate = c1 ? new Date(c1.date).getTime() : null;
send('5531000000001', 'preciso remarcar minha consulta');
let r5 = send('5531000000001', 'pode mudar para o dia 24 de julho às 14h');
if (!CLAIM_RE.test(r5)) r5 = send('5531000000001', 'sim, confirmo a remarcação');
let c1b = c1 ? (await q(`SELECT date, status FROM consultations WHERE id=$1`, [c1.id]))[0] : null;
const moved = c1b && new Date(c1b.date).getTime() !== beforeDate;
check('S5 consulta foi remarcada (data mudou)', moved, c1b ? new Date(c1b.date).toISOString() : 'n/a');
check('S5 sem confirmação falsa', CLAIM_RE.test(r5) === !!moved, `claim=${CLAIM_RE.test(r5)} moved=${moved}`);

// ---------- S6: CANCELAR a teleconsulta convênio da S2 ----------
console.log('\n### S6 — Cancelar (convênio teleconsulta S2)');
send('5531000000002', 'preciso cancelar minha consulta');
let r6 = send('5531000000002', 'sim, pode cancelar por favor');
if (!CLAIM_RE.test(r6)) r6 = send('5531000000002', 'confirmo o cancelamento');
let c2b = c2 ? (await q(`SELECT status FROM consultations WHERE id=$1`, [c2.id]))[0] : null;
const cancelled = c2b && c2b.status === 'cancelled';
check('S6 consulta cancelada no banco', cancelled, c2b ? c2b.status : 'n/a');
check('S6 sem confirmação falsa', CLAIM_RE.test(r6) === !!cancelled, `claim=${CLAIM_RE.test(r6)} cancelled=${cancelled}`);

// ---------- S7: ANTI-DOUBLE-BOOKING (tentar o slot ocupado pela S5) ----------
console.log('\n### S7 — Anti-double-booking (slot 24/07 14h já ocupado pela S5)');
send('5531000000005', 'oi quero agendar');
send('5531000000005', `cpf ${CONV_CPF}`);
let r7 = send('5531000000005', 'quero a consulta presencial no dia 24 de julho às 14h');
r7 += ' ' + send('5531000000005', 'sim confirmo');
// Não pode existir 2ª consulta scheduled às 24/07 14h para o prof 2
const dupe = await q(`SELECT COUNT(*)::int n FROM consultations WHERE professional_id=2 AND status='scheduled' AND date = (SELECT date FROM consultations WHERE id=$1)`, [c1 ? c1.id : 0]);
check('S7 não criou consulta duplicada no mesmo horário', (dupe[0]?.n || 0) <= 1, `qtd no slot=${dupe[0]?.n}`);

console.log('\n================ RESUMO ================');
const pass = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok);
console.log(`${pass}/${results.length} PASS`);
if (fail.length) { console.log('FALHAS:'); fail.forEach((f) => console.log(`  ❌ ${f.name} (${f.detail})`)); }
console.log('=======================================\n');

await pool.end();
process.exit(fail.length ? 1 : 0);
