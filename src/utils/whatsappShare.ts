/**
 * WhatsApp sharing utilities — replicates the dermato pdf-actions.tsx flow exactly:
 * 1. Try navigator.share with the PDF as a file attachment (mobile native share sheet)
 * 2. Fallback: fetch a public link and open wa.me
 */
import { getApiUrl, fetchDocumentPdf, fetchMedicalRecordPdf } from "./apiHelpers";

function buildWhatsAppUrl(
  phoneRaw: string | null | undefined,
  message: string,
): string | null {
  if (!phoneRaw?.trim()) return null;
  let digits = phoneRaw.replace(/\D/g, "");
  if (digits.length === 11 && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  if (digits.length < 12) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function firstNameFromFullName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return "Paciente";
  return t.split(/\s+/)[0] ?? t;
}

export async function shareDocumentViaWhatsApp(params: {
  documentId: number;
  documentFileName: string;
  documentTypeLabel: string;
  patientName: string;
  patientPhone: string | null | undefined;
  shareToken: string | null | undefined;
  clinicName?: string;
}): Promise<{ error?: string }> {
  const { documentId, documentFileName, documentTypeLabel, patientName, patientPhone, shareToken, clinicName } = params;
  const firstName = firstNameFromFullName(patientName);
  const clinic = clinicName?.trim() || "";
  const clinicSuffix = clinic ? ` (${clinic})` : "";
  const label = documentTypeLabel.trim() || "seu documento";

  // 1. Try navigator.share with PDF as file attachment
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      const result = await fetchDocumentPdf(documentId);
      if (result.ok) {
        const file = new File([result.blob], documentFileName, { type: "application/pdf" });
        const attachmentText = `Olá, ${firstName}! Segue em anexo ${label.toLowerCase()}${clinicSuffix}. Qualquer dúvida, estamos à disposição.`;
        const shareData: ShareData = { files: [file], text: attachmentText };
        if (navigator.canShare?.(shareData)) {
          await navigator.share(shareData);
          return {};
        }
      }
    } catch {
      /* fall through to link fallback */
    }
  }

  // 2. Fallback: wa.me with share_token link
  const linkUrl = shareToken
    ? `${getApiUrl()}/api/public/pdf?t=${shareToken}`
    : null;

  if (!linkUrl) {
    return { error: "Não foi possível gerar o link do documento." };
  }

  const linkText = `Olá, ${firstName}! Segue o link de ${label.toLowerCase()}${clinicSuffix}:\n\n${linkUrl}\n\nQualquer dúvida, estamos à disposição.`;
  const wa = buildWhatsAppUrl(patientPhone, linkText);
  if (wa) {
    window.open(wa, "_blank", "noopener,noreferrer");
    return {};
  }
  return { error: "Cadastre o telefone do paciente (com DDD) para abrir o WhatsApp." };
}

export async function shareMedicalRecordViaWhatsApp(params: {
  recordId: number;
  hasPdfUrl: boolean;
  patientName: string;
  patientPhone: string | null | undefined;
  shareToken: string | null | undefined;
  clinicName?: string;
}): Promise<{ error?: string }> {
  const { recordId, hasPdfUrl, patientName, patientPhone, shareToken, clinicName } = params;
  const firstName = firstNameFromFullName(patientName);
  const clinic = clinicName?.trim() || "";
  const clinicSuffix = clinic ? ` (${clinic})` : "";

  // 1. Try navigator.share with PDF as file attachment
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      const result = await fetchMedicalRecordPdf(recordId);
      if (result.ok) {
        const file = new File([result.blob], "prontuario.pdf", { type: "application/pdf" });
        const attachmentText = `Olá, ${firstName}! Segue em anexo o seu prontuário${clinicSuffix}. Qualquer dúvida, estamos à disposição.`;
        const shareData: ShareData = { files: [file], text: attachmentText };
        if (navigator.canShare?.(shareData)) {
          await navigator.share(shareData);
          return {};
        }
      }
    } catch {
      /* fall through to link fallback */
    }
  }

  // 2. Fallback: wa.me with share_token link
  if (!hasPdfUrl) {
    return { error: "Gere o PDF do prontuário antes de enviar pelo WhatsApp. Clique em Visualizar → Gerar PDF." };
  }

  const linkUrl = shareToken
    ? `${getApiUrl()}/api/public/pdf?t=${shareToken}`
    : null;

  if (!linkUrl) {
    return { error: "Não foi possível gerar o link do prontuário." };
  }

  const linkText = `Olá, ${firstName}! Segue o link do seu prontuário${clinicSuffix}:\n\n${linkUrl}\n\nQualquer dúvida, estamos à disposição.`;
  const wa = buildWhatsAppUrl(patientPhone, linkText);
  if (wa) {
    window.open(wa, "_blank", "noopener,noreferrer");
    return {};
  }
  return { error: "Cadastre o telefone do paciente (com DDD) para abrir o WhatsApp." };
}
