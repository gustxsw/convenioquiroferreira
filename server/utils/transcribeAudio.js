/**
 * Transcrição de áudio recebido no WhatsApp (OGG/Opus) via API compatível com
 * Whisper. O paciente manda áudio; a gente transcreve e a Secretária trata como
 * se fosse texto — em vez de responder "não consigo ouvir".
 *
 * Default: Groq (whisper-large-v3-turbo) — barato, rápido e aceita OGG direto,
 * sem precisar de ffmpeg. Trocando as envs, funciona com OpenAI Whisper também.
 * Ligado pela flag WHATSAPP_TRANSCRIBE=on; sem chave ou desligado, devolve null
 * e o fluxo cai no fallback ("pode escrever / pedir atendente").
 */
const API_URL =
  process.env.TRANSCRIBE_API_URL ||
  "https://api.groq.com/openai/v1/audio/transcriptions";
const API_KEY = process.env.TRANSCRIBE_API_KEY;
const MODEL = process.env.TRANSCRIBE_MODEL || "whisper-large-v3-turbo";
// Áudio muito longo → não transcreve (protege custo/latência; áudios reais de
// paciente têm segundos). ~8MB de opus são dezenas de minutos.
const MAX_BYTES = 8 * 1024 * 1024;

export function transcriptionEnabled() {
  return process.env.WHATSAPP_TRANSCRIBE === "on" && !!API_KEY;
}

/**
 * @param {string} mediaUrl  URL pública do áudio (secure_url do Cloudinary)
 * @param {string} [mime]    mimetype original (ex.: "audio/ogg")
 * @returns {Promise<string|null>} texto transcrito, ou null (desligado/falha/grande)
 */
export async function transcribeAudio(mediaUrl, mime = "audio/ogg") {
  if (!transcriptionEnabled() || !mediaUrl) return null;
  try {
    const audioRes = await fetch(mediaUrl);
    if (!audioRes.ok) return null;
    const bytes = Buffer.from(await audioRes.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime || "audio/ogg" }), "audio.ogg");
    form.append("model", MODEL);
    form.append("language", "pt"); // trava no português → mais preciso e rápido
    form.append("response_format", "text");

    const r = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: form,
    });
    if (!r.ok) {
      let body = "";
      try { body = await r.text(); } catch { /* ignore */ }
      process.stderr.write(`[transcribe] HTTP ${r.status}: ${body.slice(0, 200)}\n`);
      return null;
    }
    const text = (await r.text()).trim();
    return text || null;
  } catch (e) {
    process.stderr.write("[transcribe] falhou: " + String(e) + "\n");
    return null;
  }
}
