/**
 * Medical document PDF generation via Python document_service + Cloudinary upload.
 */
import { v2 as cloudinary } from "cloudinary";
import { renderPdfFromDocumentService } from "./documentServiceClient.js";

const DOCUMENT_TYPES = new Set([
  "certificate",
  "prescription",
  "consent_form",
  "exam_request",
  "declaration",
  "lgpd",
  "other",
  "medical_record",
]);

/**
 * @param {Buffer} pdfBuffer
 * @param {string} fileName
 */
async function uploadPdfBufferToCloudinary(pdfBuffer, fileName) {
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 100) {
    throw new Error("PDF inválido ou vazio");
  }
  if (!fileName || typeof fileName !== "string") {
    throw new Error("Nome do arquivo é obrigatório");
  }

  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 11);
  const uniqueFileName = `${fileName}_${timestamp}_${randomString}`;

  const b64 = pdfBuffer.toString("base64");
  const uploadResult = await cloudinary.uploader.upload(
    `data:application/pdf;base64,${b64}`,
    {
      folder: "quiro-ferreira/documents",
      resource_type: "raw",
      format: "pdf",
      public_id: uniqueFileName,
      use_filename: false,
      unique_filename: true,
    }
  );

  return {
    url: uploadResult.secure_url,
    public_id: uploadResult.public_id,
    bytes: uploadResult.bytes,
    format: "pdf",
  };
}

/**
 * @param {string} documentType
 * @param {Record<string, unknown>} templateData
 */
export const generateDocumentPDF = async (documentType, templateData) => {
  if (!documentType || typeof documentType !== "string") {
    throw new Error("Document type is required and must be a string");
  }
  if (!templateData || typeof templateData !== "object") {
    throw new Error("Template data is required and must be an object");
  }

  const type = DOCUMENT_TYPES.has(documentType) ? documentType : "other";

  const pdfBuffer = await renderPdfFromDocumentService(type, templateData);

  const fileName = `${type}_${(templateData.patientName || templateData.patient_name || "document")
    .toString()
    .replace(/[^a-zA-Z0-9_]/g, "_")}`;

  const result = await uploadPdfBufferToCloudinary(pdfBuffer, fileName);
  console.log("✅ PDF uploaded to Cloudinary:", result.url);
  return result;
};

/**
 * @deprecated Preview HTML is no longer generated on the server; use PDF URLs from the API.
 */
export const generateDocumentHTML = () => {
  throw new Error(
    "generateDocumentHTML foi removido: use geração de PDF via DOCUMENT_SERVICE_URL."
  );
};

export const testDocumentGeneration = async () => {
  const testData = {
    patientName: "João Silva",
    patientCpf: "12345678901",
    professionalName: "Dr. Maria Santos",
    professionalSpecialty: "Fisioterapeuta",
    crm: "CREFITO 12345/GO",
    title: "Teste de Documento",
    description: "Teste de geração de documento",
    days: "3",
    content: "Conteúdo de teste para validação do sistema",
  };
  return generateDocumentPDF("certificate", testData);
};

export const generatePDFFromHTML = async () => {
  throw new Error(
    "generatePDFFromHTML não é mais suportado; use generateDocumentPDF com o tipo adequado."
  );
};
