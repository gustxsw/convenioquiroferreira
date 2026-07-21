/**
 * Auth state do Baileys persistido no Postgres (substitui useMultiFileAuthState).
 *
 * Por que: a produção roda no Render, cujo filesystem é EFÊMERO — a pasta
 * `server/.baileys_auth` é destruída a cada deploy/restart, o que derrubaria o
 * pareamento do WhatsApp e exigiria escanear o QR de novo toda vez. Guardando as
 * credenciais no banco, o número continua pareado entre deploys.
 *
 * Formato idêntico ao useMultiFileAuthState: cada "arquivo" vira uma linha
 * (session_id, key). Os valores são serializados com o BufferJSON do Baileys, que
 * preserva os Buffers das chaves de criptografia.
 *
 * IMPORTANTE — isolamento por ambiente: dev e produção normalmente apontam para o
 * MESMO banco Neon. Duas instâncias compartilhando a mesma sessão corrompem o
 * pareamento, então o session_id default separa produção de desenvolvimento.
 */

import { initAuthCreds, BufferJSON, proto } from "@whiskeysockets/baileys";
import { pool } from "../db.js";

// prod e dev nunca compartilham sessão (ver comentário do topo).
export const DEFAULT_SESSION_ID =
  process.env.BAILEYS_SESSION_ID ||
  (process.env.NODE_ENV === "production" ? "prod" : "dev");

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_baileys_auth (
      session_id TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (session_id, key)
    );
  `);
  tableReady = true;
}

/**
 * Apaga a sessão inteira — usado no logout (o WhatsApp invalidou as credenciais)
 * e quando o admin pede para parear outro número.
 */
export async function clearAuthState(sessionId = DEFAULT_SESSION_ID) {
  await ensureTable();
  await pool.query("DELETE FROM whatsapp_baileys_auth WHERE session_id = $1", [sessionId]);
}

export async function hasStoredSession(sessionId = DEFAULT_SESSION_ID) {
  await ensureTable();
  const r = await pool.query(
    "SELECT 1 FROM whatsapp_baileys_auth WHERE session_id = $1 AND key = 'creds' LIMIT 1",
    [sessionId]
  );
  return r.rowCount > 0;
}

export async function usePostgresAuthState(sessionId = DEFAULT_SESSION_ID) {
  await ensureTable();

  const readData = async (key) => {
    const r = await pool.query(
      "SELECT value FROM whatsapp_baileys_auth WHERE session_id = $1 AND key = $2",
      [sessionId, key]
    );
    if (!r.rowCount) return null;
    try {
      return JSON.parse(r.rows[0].value, BufferJSON.reviver);
    } catch {
      return null; // linha corrompida: trata como ausente em vez de derrubar a conexão
    }
  };

  const writeData = async (key, value) => {
    const json = JSON.stringify(value, BufferJSON.replacer);
    await pool.query(
      `INSERT INTO whatsapp_baileys_auth (session_id, key, value, updated_at)
            VALUES ($1, $2, $3, NOW())
       ON CONFLICT (session_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [sessionId, key, json]
    );
  };

  const removeData = async (key) => {
    await pool.query(
      "DELETE FROM whatsapp_baileys_auth WHERE session_id = $1 AND key = $2",
      [sessionId, key]
    );
  };

  const creds = (await readData("creds")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              // O Baileys espera esse tipo desserializado como mensagem proto.
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              if (value) data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const type of Object.keys(data)) {
            for (const id of Object.keys(data[type] || {})) {
              const value = data[type][id];
              const key = `${type}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData("creds", creds),
    sessionId,
  };
}
