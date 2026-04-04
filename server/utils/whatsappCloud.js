/**
 * Meta WhatsApp Cloud API — send document by public HTTPS link.
 */

const GRAPH_VERSION = "v21.0";

export function isWhatsappCloudConfigured() {
  return !!(
    process.env.WHATSAPP_CLOUD_TOKEN?.trim() &&
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
  );
}

/**
 * @param {object} opts
 * @param {string} opts.toDigits E.164 without + (e.g. 5511999999999)
 * @param {string} opts.documentUrl Public HTTPS URL to PDF
 * @param {string} [opts.filename]
 * @param {string} [opts.caption]
 */
export async function sendWhatsappDocumentMessage({
  toDigits,
  documentUrl,
  filename = "documento.pdf",
  caption = "",
}) {
  const token = process.env.WHATSAPP_CLOUD_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) {
    throw new Error(
      "WhatsApp Cloud API não configurada (WHATSAPP_CLOUD_TOKEN / WHATSAPP_PHONE_NUMBER_ID)."
    );
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: String(toDigits).replace(/\D/g, ""),
    type: "document",
    document: {
      link: documentUrl,
      filename,
      caption: caption.slice(0, 1024),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      JSON.stringify(data);
    throw new Error(msg || `WhatsApp API ${res.status}`);
  }
  return data;
}
