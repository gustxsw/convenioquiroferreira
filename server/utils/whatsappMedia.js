/**
 * Upload de mídia recebida no WhatsApp (áudio/imagem/documento) para o Cloudinary,
 * para o operador ouvir/abrir no painel de atendimento. Recebe um Buffer e devolve a
 * URL pública (secure_url) ou null se o Cloudinary não estiver configurado / falhar.
 */
let _cloudinary = null;

async function getCloudinary() {
  if (_cloudinary) return _cloudinary;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return null;
  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  _cloudinary = cloudinary;
  return cloudinary;
}

// Mapeia o tipo de mídia para o resource_type do Cloudinary.
//   image -> "image"; audio/video -> "video" (o Cloudinary trata áudio como vídeo);
//   document/outros -> "raw".
function resourceTypeFor(mediaType) {
  if (mediaType === "image" || mediaType === "sticker") return "image";
  if (mediaType === "audio" || mediaType === "video") return "video";
  return "raw";
}

/**
 * @param {Buffer} buffer  conteúdo binário da mídia
 * @param {object} opts
 * @param {string} opts.mediaType  "image" | "audio" | "video" | "document" | ...
 * @param {string} [opts.mime]     mimetype original (ex.: "audio/ogg")
 * @returns {Promise<string|null>} secure_url ou null
 */
export async function uploadWhatsappMedia(buffer, { mediaType, mime } = {}) {
  try {
    const cloudinary = await getCloudinary();
    if (!cloudinary || !buffer?.length) return null;
    const resourceType = resourceTypeFor(mediaType);
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "quiro-ferreira/whatsapp-inbound", resource_type: resourceType },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(buffer);
    });
    return result?.secure_url || null;
  } catch (e) {
    process.stderr.write("[whatsapp-media] upload falhou: " + String(e) + "\n");
    return null;
  }
}
