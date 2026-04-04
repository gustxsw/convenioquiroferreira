import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  FileText,
  Download,
  X,
  Eye,
  AlertCircle,
  CheckCircle,
  Printer,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../utils/apiHelpers";

type RecordData = {
  id: number;
  patient_name: string;
  chief_complaint?: string;
  history_present_illness?: string;
  past_medical_history?: string;
  medications?: string;
  allergies?: string;
  physical_examination?: string;
  diagnosis?: string;
  treatment_plan?: string;
  notes?: string;
  vital_signs?: Record<string, unknown>;
  created_at: string;
  pdf_url?: string | null;
};

type MedicalRecordPreviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  recordData: RecordData;
  professionalData: {
    name: string;
    specialty: string;
    crm: string;
  };
  documentServiceConfigured?: boolean;
  onRecordPdfUpdated?: (record: RecordData) => void;
};

const MedicalRecordPreviewModal: React.FC<MedicalRecordPreviewModalProps> = ({
  isOpen,
  onClose,
  recordData,
  professionalData,
  documentServiceConfigured = false,
  onRecordPdfUpdated,
}) => {
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  useEffect(() => {
    const fetchSignature = async () => {
      try {
        const apiUrl = getApiUrl();
        const response = await fetchWithAuth(
          `${apiUrl}/api/professionals/${user?.id}/signature`
        );
        if (response.ok) {
          const signatureData = await response.json();
          setSignatureUrl(signatureData.signature_url);
        }
      } catch {
        /* ignore */
      }
    };
    if (isOpen && user?.id) {
      fetchSignature();
    }
  }, [isOpen, user?.id]);

  const generateHTML = () => {
    const vitalSigns = recordData.vital_signs || {};
    const hasVitalSigns = Object.values(vitalSigns).some(
      (value) => value && value.toString().trim()
    );

    let vitalSignsHTML = "";
    if (hasVitalSigns) {
      const vitalSignItems = [
        { label: "Pressão Arterial", value: vitalSigns.blood_pressure },
        { label: "Freq. Cardíaca", value: vitalSigns.heart_rate },
        { label: "Temperatura", value: vitalSigns.temperature },
        { label: "Freq. Respiratória", value: vitalSigns.respiratory_rate },
        { label: "Sat. O₂", value: vitalSigns.oxygen_saturation },
        { label: "Peso", value: vitalSigns.weight },
        { label: "Altura", value: vitalSigns.height },
      ].filter((item) => item.value && item.value.toString().trim());

      if (vitalSignItems.length > 0) {
        vitalSignsHTML = `
          <div class="section">
            <h3>Sinais Vitais</h3>
            <div class="vital-signs-grid">
              ${vitalSignItems
                .map(
                  (item) => `
                <div class="vital-sign-item">
                  <div class="vital-sign-label">${item.label}</div>
                  <div class="vital-sign-value">${item.value}</div>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        `;
      }
    }

    const medicalSections = [
      { title: "Queixa Principal", content: recordData.chief_complaint },
      {
        title: "História da Doença Atual",
        content: recordData.history_present_illness,
      },
      {
        title: "História Médica Pregressa",
        content: recordData.past_medical_history,
      },
      { title: "Medicamentos em Uso", content: recordData.medications },
      { title: "Alergias", content: recordData.allergies },
      { title: "Exame Físico", content: recordData.physical_examination },
      { title: "Diagnóstico", content: recordData.diagnosis },
      { title: "Plano de Tratamento", content: recordData.treatment_plan },
      { title: "Observações Gerais", content: recordData.notes },
    ].filter((section) => section.content && section.content.trim());

    const medicalSectionsHTML = medicalSections
      .map(
        (section) => `
      <div class="section">
        <h3>${section.title}</h3>
        <p>${section.content}</p>
      </div>
    `
      )
      .join("");

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Prontuário Médico - ${recordData.patient_name}</title>
    <style>
        @page { size: A4; margin: 15mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Times New Roman', serif !important;
            font-size: 14px !important;
            line-height: 1.6 !important;
            color: #000000 !important;
            background: #ffffff !important;
            padding: 20px !important;
        }
        .title {
            font-size: 20px !important;
            font-weight: bold !important;
            text-transform: uppercase;
            margin: 30px 0 !important;
            text-align: center;
        }
        .patient-info {
            background: #f9f9f9 !important;
            padding: 15px !important;
            border-left: 4px solid #333 !important;
            margin: 20px 0 !important;
        }
        .section {
            margin: 20px 0 !important;
            padding: 15px !important;
            border: 1px solid #ddd !important;
            page-break-inside: avoid;
        }
        .section h3 {
            margin: 0 0 10px 0 !important;
            font-size: 16px !important;
            border-bottom: 1px solid #eee !important;
            padding-bottom: 5px !important;
        }
        .vital-signs-grid {
            display: grid !important;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)) !important;
            gap: 10px !important;
        }
        .vital-sign-item { text-align: center; padding: 10px !important; background: #f8f9fa !important; border: 1px solid #e9ecef !important; }
        .signature { margin-top: 60px !important; text-align: center; }
        .signature-line { border-top: 1px solid #000; width: 300px; margin: 40px auto 10px !important; }
        .signature-image { max-width: 200px !important; max-height: 60px !important; margin: 20px auto 10px !important; display: block !important; }
    </style>
</head>
<body>
    <div class="title">Prontuário Médico</div>
    <div class="patient-info">
        <strong>Paciente:</strong> ${recordData.patient_name}<br>
        <strong>Data do Atendimento:</strong> ${new Date(recordData.created_at).toLocaleDateString("pt-BR")}<br>
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString("pt-BR")}
    </div>
    ${vitalSignsHTML}
    ${medicalSectionsHTML}
    ${
      medicalSections.length === 0
        ? `<div class="section"><p><em>Prontuário médico sem informações clínicas detalhadas registradas.</em></p></div>`
        : ""
    }
    <div class="signature">
        ${
          signatureUrl
            ? `<img src="${signatureUrl}" alt="Assinatura" class="signature-image" />`
            : '<div class="signature-line"></div>'
        }
        <div>
            <strong>${professionalData.name}</strong><br>
            ${professionalData.specialty}<br>
            ${professionalData.crm ? `Registro: ${professionalData.crm}` : ""}
        </div>
    </div>
</body>
</html>`;
  };

  const printMedicalRecord = () => {
    try {
      setError("");
      if (recordData.pdf_url) {
        window.open(recordData.pdf_url, "_blank", "noopener,noreferrer");
        return;
      }
      const htmlContent = generateHTML();
      if (isMobile) {
        const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
        window.location.href = URL.createObjectURL(blob);
        setSuccess("Documento aberto. Use imprimir no navegador.");
        return;
      }
      const printWindow = window.open("", "_blank", "width=800,height=600");
      if (!printWindow) {
        throw new Error("Popup bloqueado. Permita popups para imprimir.");
      }
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          setTimeout(() => printWindow.close(), 1000);
        }, 500);
      };
      setSuccess("Janela de impressão aberta.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao imprimir");
    }
  };

  const downloadAsHTML = () => {
    try {
      const htmlContent = generateHTML();
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      if (isMobile) {
        window.location.href = url;
        return;
      }
      const link = document.createElement("a");
      link.href = url;
      link.download = `Prontuario_${recordData.patient_name.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSuccess("HTML baixado.");
    } catch {
      setError("Erro ao baixar HTML");
    }
  };

  const regeneratePdf = async () => {
    setError("");
    setSuccess("");
    setRegenerating(true);
    try {
      const apiUrl = getApiUrl();
      const res = await fetchWithAuth(
        `${apiUrl}/api/medical-records/${recordData.id}/regenerate-pdf`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Falha ao gerar PDF");
      }
      setSuccess("PDF gerado com sucesso.");
      if (data.record && onRecordPdfUpdated) {
        onRecordPdfUpdated(data.record as RecordData);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar PDF");
    } finally {
      setRegenerating(false);
    }
  };

  if (!isOpen) return null;

  const hasPdf = !!recordData.pdf_url;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center">
            <FileText className="h-6 w-6 text-red-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {hasPdf ? "Prontuário (PDF)" : "Preview do Prontuário"}
              </h2>
              <p className="text-sm text-gray-600">
                Paciente: {recordData.patient_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 bg-red-50 text-red-600 p-3 rounded-lg flex items-center">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 bg-green-50 text-green-600 p-3 rounded-lg flex items-center">
            <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            {success}
          </div>
        )}

        <div className="flex-1 overflow-hidden p-6 min-h-[50vh]">
          {hasPdf ? (
            <iframe
              title="PDF do prontuário"
              src={recordData.pdf_url!}
              className="w-full h-full min-h-[60vh] border border-gray-200 rounded-lg"
            />
          ) : (
            <iframe
              title="Preview HTML"
              srcDoc={generateHTML()}
              className="w-full h-full min-h-[60vh] border border-gray-200 rounded-lg bg-white"
              sandbox="allow-same-origin allow-modals"
            />
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-2 justify-between items-center">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Eye className="h-4 w-4" />
            {hasPdf
              ? "PDF gerado no servidor"
              : "Pré-visualização local — gere o PDF para envio por WhatsApp com link estável"}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {hasPdf && (
              <>
                <a
                  href={recordData.pdf_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary inline-flex items-center"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir PDF
                </a>
                <a
                  href={recordData.pdf_url!}
                  download
                  className="btn btn-secondary inline-flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar PDF
                </a>
              </>
            )}
            {!hasPdf && (
              <button
                type="button"
                onClick={downloadAsHTML}
                className="btn btn-secondary inline-flex items-center"
              >
                <Download className="h-4 w-4 mr-2" />
                Baixar HTML
              </button>
            )}
            {documentServiceConfigured && (
              <button
                type="button"
                onClick={() => void regeneratePdf()}
                disabled={regenerating}
                className="btn btn-secondary inline-flex items-center"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${regenerating ? "animate-spin" : ""}`}
                />
                {hasPdf ? "Atualizar PDF" : "Gerar PDF"}
              </button>
            )}
            <button
              type="button"
              onClick={printMedicalRecord}
              className="btn btn-primary inline-flex items-center"
            >
              <Printer className="h-4 w-4 mr-2" />
              {hasPdf ? "Abrir para imprimir" : "Imprimir"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MedicalRecordPreviewModal;
