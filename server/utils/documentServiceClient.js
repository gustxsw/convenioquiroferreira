/**
 * Geração de PDF via Python (WeasyPrint + Jinja2) chamado diretamente por execFile.
 * Sem servidor HTTP nem Docker — mesmo padrão do projeto dermato.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SCRIPT_PATH = join(__dirname, "../../scripts/generate_pdf.py");
const TIMEOUT_MS = Number(process.env.DOCUMENT_SERVICE_TIMEOUT_MS || 60_000);

function getPythonBin() {
  return (
    process.env.DOCUMENT_SERVICE_PYTHON?.trim() ||
    (process.platform === "win32" ? "python" : "python3")
  );
}

/**
 * @param {string} documentType
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Buffer>}
 */
export async function renderPdfFromDocumentService(documentType, payload) {
  const tmpDir = join(tmpdir(), `quiro-pdf-${randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });
  const inFile = join(tmpDir, "in.json");
  const outFile = join(tmpDir, "out.pdf");

  try {
    await writeFile(
      inFile,
      JSON.stringify({ document_type: documentType, payload }),
      "utf8"
    );

    await execFileAsync(getPythonBin(), [SCRIPT_PATH, inFile, outFile], {
      maxBuffer: 20 * 1024 * 1024,
      timeout: TIMEOUT_MS,
      windowsHide: true,
    });

    return await readFile(outFile);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Falha ao gerar PDF (Python/reportlab). ` +
      `Instale as dependencias com: pip install -r scripts/requirements.txt\n` +
      `Detalhe: ${detail}`
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
