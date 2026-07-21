/**
 * Backup do banco de produção em formato custom do PostgreSQL (.backup).
 *
 * Chamado pelo `backup_banco.bat` da raiz do projeto. A URL do banco vem da
 * `.env` (via dotenv) e NUNCA é impressa nem passada pela linha de comando do
 * .bat — o cmd expandiria `%` e `&` da senha e corromperia a conexão.
 *
 * O arquivo é gravado FORA do repositório: contém CPF, prontuários e telefones
 * de pacientes reais e não pode ser versionado.
 *
 * Uso direto (sem o .bat):  node scripts/backup_db.mjs
 */

import "dotenv/config";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const DEST_DIR = "C:/Users/Suporte/Desktop/backups_banco";
const MANTER = 10; // quantos backups conservar; os mais antigos são apagados

// --no-owner/--no-acl: os papéis do Neon não existem em outro servidor, e sem
// isso a restauração falha justamente quando mais se precisa dela.
const DUMP_ARGS = ["--format=custom", "--no-owner", "--no-acl", "--verbose"];

function acharPgDump() {
  const candidatos = [];
  const base = "C:/Program Files/PostgreSQL";
  if (fs.existsSync(base)) {
    // Versão mais nova primeiro: pg_dump precisa ser >= servidor.
    for (const v of fs.readdirSync(base).sort((a, b) => Number(b) - Number(a))) {
      candidatos.push(`${base}/${v}/bin/pg_dump.exe`);
    }
  }
  candidatos.push("pg_dump"); // se estiver no PATH
  return candidatos.find((c) => c === "pg_dump" || fs.existsSync(c)) || null;
}

function limparAntigos() {
  const arquivos = fs
    .readdirSync(DEST_DIR)
    .filter((f) => f.endsWith(".backup"))
    .map((f) => ({ f, t: fs.statSync(path.join(DEST_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const sobrando = arquivos.slice(MANTER);
  for (const { f } of sobrando) {
    fs.unlinkSync(path.join(DEST_DIR, f));
    console.log(`   removido backup antigo: ${f}`);
  }
  return { total: arquivos.length, removidos: sobrando.length };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERRO: DATABASE_URL nao encontrada no .env");
    process.exit(1);
  }

  const pgDump = acharPgDump();
  if (!pgDump) {
    console.error("ERRO: pg_dump nao encontrado. Instale o PostgreSQL client tools.");
    process.exit(1);
  }

  fs.mkdirSync(DEST_DIR, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const destino = `${DEST_DIR}/convenioquiroferreira_${stamp}.backup`;

  console.log(`Gerando backup...`);
  console.log(`   destino: ${destino}`);

  const codigo = await new Promise((resolve) => {
    const p = spawn(pgDump, [process.env.DATABASE_URL, ...DUMP_ARGS, "--file", destino], {
      stdio: ["ignore", "inherit", "pipe"],
    });
    let tabelas = 0;
    p.stderr.on("data", (d) => {
      const s = d.toString();
      tabelas += (s.match(/dumping contents of table/g) || []).length;
      // Só mostra problema real; o --verbose do pg_dump é ruidoso demais.
      if (/error|fatal|could not/i.test(s)) process.stderr.write(s);
    });
    p.on("error", (e) => {
      console.error("ERRO ao executar pg_dump:", e.message);
      resolve(1);
    });
    p.on("close", (c) => {
      if (c === 0) console.log(`   ${tabelas} tabelas exportadas`);
      resolve(c);
    });
  });

  if (codigo !== 0) {
    // Não deixa um arquivo pela metade passando por backup bom.
    if (fs.existsSync(destino)) fs.unlinkSync(destino);
    console.error("\nFALHOU: backup nao foi gerado.");
    process.exit(1);
  }

  const kb = (fs.statSync(destino).size / 1024).toFixed(0);
  console.log(`\nOK: backup gerado (${kb} KB)`);

  const { total, removidos } = limparAntigos();
  console.log(`Backups guardados: ${Math.min(total, MANTER)} (limite ${MANTER}${removidos ? `, ${removidos} apagado(s)` : ""})`);
}

main().catch((e) => {
  console.error("ERRO inesperado:", e.message);
  process.exit(1);
});
