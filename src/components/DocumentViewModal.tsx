import React, { useState, useEffect } from "react";
import {
  FileText,
  X,
  Eye,
  Download,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { fetchDocumentPdf } from "../utils/apiHelpers";

type DocumentViewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  documentId: number;
  documentTitle: string;
};

const DocumentViewModal: React.FC<DocumentViewModalProps> = ({
  isOpen,
  onClose,
  documentId,
  documentTitle,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      const result = await fetchDocumentPdf(documentId);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        setLoading(false);
        return;
      }
      const url = URL.createObjectURL(result.blob);
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [isOpen, documentId]);

  if (!isOpen) return null;

  const safeName = `${(documentTitle || "Documento")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .replace(/\s+/g, "_")}.pdf`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center">
            <FileText className="h-6 w-6 text-red-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">{documentTitle}</h2>
              <p className="text-sm text-gray-600">Visualização do documento</p>
            </div>
          </div>
          <button
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

        <div className="flex-1 overflow-hidden p-6 min-h-[50vh]">
          {loading ? (
            <div className="flex items-center justify-center min-h-[60vh] text-gray-600 text-sm border border-gray-200 rounded-lg bg-gray-50">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600 mx-auto mb-3" />
                Carregando PDF…
              </div>
            </div>
          ) : blobUrl ? (
            <iframe
              title="PDF do documento"
              src={blobUrl}
              className="w-full h-full min-h-[60vh] border border-gray-200 rounded-lg"
            />
          ) : !error ? (
            <div className="flex items-center justify-center min-h-[60vh] text-gray-500 text-sm border border-dashed border-gray-200 rounded-lg">
              PDF indisponível para visualização.
            </div>
          ) : null}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 flex flex-wrap gap-2 justify-between items-center">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Eye className="h-4 w-4" />
            <span>Visualização do documento</span>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {blobUrl && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    window.open(blobUrl, "_blank", "noopener,noreferrer")
                  }
                  className="btn btn-secondary inline-flex items-center"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = blobUrl;
                    a.download = safeName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  className="btn btn-secondary inline-flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Baixar PDF
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn btn-primary inline-flex items-center"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentViewModal;
