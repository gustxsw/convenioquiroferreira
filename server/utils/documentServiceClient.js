/**
 * HTTP client for the Python document PDF service (FastAPI /v1/render).
 */

const DEFAULT_TIMEOUT_MS = 120_000;

function baseUrl() {
  const raw = (process.env.DOCUMENT_SERVICE_URL || "").trim();
  return raw.replace(/\/$/, "");
}

/**
 * @param {string} documentType
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Buffer>}
 */
export async function renderPdfFromDocumentService(documentType, payload) {
  const base = baseUrl();
  if (!base) {
    throw new Error(
      "Serviço de documentos não configurado. Defina DOCUMENT_SERVICE_URL e inicie o serviço Python (document_service)."
    );
  }

  const timeoutMs = Number(
    process.env.DOCUMENT_SERVICE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS
  );
  const headers = { "Content-Type": "application/json" };
  const key = (process.env.DOCUMENT_SERVICE_KEY || "").trim();
  if (key) {
    headers["X-Document-Service-Key"] = key;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/v1/render`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        document_type: documentType,
        payload,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const j = await res.json();
        if (j?.detail) {
          detail = Array.isArray(j.detail)
            ? j.detail.map((d) => d.msg || d).join("; ")
            : String(j.detail);
        }
      } catch {
        detail = await res.text().catch(() => detail);
      }
      throw new Error(detail || `Serviço de documentos retornou ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }
}
