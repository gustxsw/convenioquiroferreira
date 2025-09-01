import React, { useState } from 'react';
import { FileText, Download, Save, X, Eye, AlertCircle, CheckCircle } from 'lucide-react';

declare global {
  interface Window {
    html2pdf: any;
  }
}

type DocumentPreviewProps = {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  htmlContent: string;
  documentData: {
    document_type: string;
    patient_name: string;
    patient_cpf?: string;
    professional_name: string;
    [key: string]: any;
  };
};

const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  isOpen,
  onClose,
  documentTitle,
  htmlContent,
  documentData,
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Get API URL
  const getApiUrl = () => {
    if (
      window.location.hostname === "cartaoquiroferreira.com.br" ||
      window.location.hostname === "www.cartaoquiroferreira.com.br"
    ) {
      return "https://www.cartaoquiroferreira.com.br";
    }
    return "http://localhost:3001";
  };

  // Load html2pdf library dynamically
  const loadHtml2Pdf = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.html2pdf) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = () => {
        console.log('✅ html2pdf.js loaded successfully');
        resolve();
      };
      script.onerror = () => {
        console.error('❌ Failed to load html2pdf.js');
        reject(new Error('Falha ao carregar biblioteca de PDF'));
      };
      document.head.appendChild(script);
    });
  };

  const generateAndSavePdf = async () => {
    try {
      setIsGeneratingPdf(true);
      setError('');
      setSuccess('');

      console.log('🔄 Starting PDF generation process...');

      // Load html2pdf library
      await loadHtml2Pdf();

      // Create a temporary container for the HTML content
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = htmlContent;
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '-9999px';
      tempContainer.style.width = '210mm'; // A4 width
      document.body.appendChild(tempContainer);

      // Configure PDF options
      const options = {
        margin: [10, 10, 10, 10],
        filename: `${documentTitle.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true,
          allowTaint: false
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait',
          compress: true
        }
      };

      console.log('🔄 Generating PDF with options:', options);

      // Generate PDF
      const pdfBlob = await window.html2pdf()
        .set(options)
        .from(tempContainer)
        .outputPdf('blob');

      console.log('✅ PDF generated successfully, size:', pdfBlob.size);

      // Clean up temporary container
      document.body.removeChild(tempContainer);

      // Convert blob to base64 for backend
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          setIsSaving(true);
          const base64Data = (reader.result as string).split(',')[1];

          console.log('🔄 Saving PDF to backend...');

          // Save to backend
          const token = localStorage.getItem('token');
          const apiUrl = getApiUrl();

          const response = await fetch(`${apiUrl}/api/documents/save`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: documentTitle,
              document_type: documentData.document_type,
              patient_name: documentData.patient_name,
              patient_cpf: documentData.patient_cpf || null,
              pdf_data: base64Data,
              document_metadata: documentData,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao salvar documento no servidor');
          }

          const result = await response.json();
          console.log('✅ Document saved to backend:', result);

          // Download PDF locally
          const url = URL.createObjectURL(pdfBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = options.filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          setSuccess('PDF gerado, baixado e salvo com sucesso!');
          
          // Auto-close after success
          setTimeout(() => {
            onClose();
          }, 2000);
        } catch (error) {
          console.error('❌ Error saving PDF:', error);
          setError(error instanceof Error ? error.message : 'Erro ao salvar PDF');
        } finally {
          setIsSaving(false);
        }
      };

      reader.onerror = () => {
        setError('Erro ao processar PDF');
        setIsGeneratingPdf(false);
        setIsSaving(false);
      };

      reader.readAsDataURL(pdfBlob);
    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      setError(error instanceof Error ? error.message : 'Erro ao gerar PDF');
      setIsGeneratingPdf(false);
      setIsSaving(false);
    }
  };

  const downloadHtml = () => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${documentTitle.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const isProcessing = isGeneratingPdf || isSaving;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center">
            <FileText className="h-6 w-6 text-red-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">{documentTitle}</h2>
              <p className="text-sm text-gray-600">
                Paciente: {documentData.patient_name}
              </p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isProcessing}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Feedback Messages */}
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

        {/* Document Preview */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div 
              className="p-8"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
              style={{
                fontFamily: 'Times New Roman, serif',
                lineHeight: '1.6',
                color: '#333',
                maxWidth: '210mm',
                margin: '0 auto',
                minHeight: '297mm', // A4 height
                backgroundColor: 'white'
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Eye className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-600">
              Visualização do documento
            </span>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={downloadHtml}
              className="btn btn-secondary flex items-center"
              disabled={isProcessing}
            >
              <Download className="h-4 w-4 mr-2" />
              Baixar HTML
            </button>

            <button
              onClick={generateAndSavePdf}
              className={`btn btn-primary flex items-center ${
                isProcessing ? 'opacity-70 cursor-not-allowed' : ''
              }`}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {isGeneratingPdf ? 'Gerando PDF...' : 'Salvando...'}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar em PDF
                </>
              )}
            </button>
          </div>
        </div>

        {/* Processing Status */}
        {isProcessing && (
          <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-700 font-medium">
                {isGeneratingPdf ? 'Gerando PDF...' : 'Salvando documento...'}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                {isGeneratingPdf 
                  ? 'Convertendo HTML para PDF, aguarde...'
                  : 'Enviando para o servidor e salvando...'
                }
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentPreview;