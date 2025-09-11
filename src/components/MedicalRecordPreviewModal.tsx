import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { FileText, Download, Save, X, Eye, AlertCircle, CheckCircle, Printer } from 'lucide-react';

declare global {
  interface Window {
    html2pdf: any;
  }
}

type MedicalRecordPreviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  recordData: {
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
    vital_signs?: any;
    created_at: string;
  };
  professionalData: {
    name: string;
    specialty: string;
    crm: string;
  };
};

const MedicalRecordPreviewModal: React.FC<MedicalRecordPreviewModalProps> = ({
  isOpen,
  onClose,
  recordData,
  professionalData,
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

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

  // Fetch professional signature
  useEffect(() => {
    const fetchSignature = async () => {
      try {
        const token = localStorage.getItem('token');
        const apiUrl = getApiUrl();

        const response = await fetch(`${apiUrl}/api/professionals/${user?.id}/signature`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const signatureData = await response.json();
          setSignatureUrl(signatureData.signature_url);
        }
      } catch (error) {
        console.warn('Could not load signature:', error);
      }
    };

    if (isOpen && user?.id) {
      fetchSignature();
    }
  }, [isOpen, user?.id]);

  // Generate HTML content for the medical record
  const generateHTML = () => {
    const vitalSigns = recordData.vital_signs || {};
    const hasVitalSigns = Object.values(vitalSigns).some(value => value && value.toString().trim());

    let vitalSignsHTML = '';
    if (hasVitalSigns) {
      const vitalSignItems = [
        { label: 'Pressão Arterial', value: vitalSigns.blood_pressure },
        { label: 'Freq. Cardíaca', value: vitalSigns.heart_rate },
        { label: 'Temperatura', value: vitalSigns.temperature },
        { label: 'Freq. Respiratória', value: vitalSigns.respiratory_rate },
        { label: 'Sat. O₂', value: vitalSigns.oxygen_saturation },
        { label: 'Peso', value: vitalSigns.weight },
        { label: 'Altura', value: vitalSigns.height }
      ].filter(item => item.value && item.value.toString().trim());

      if (vitalSignItems.length > 0) {
        vitalSignsHTML = `
          <div class="section">
            <h3>Sinais Vitais</h3>
            <div class="vital-signs-grid">
              ${vitalSignItems.map(item => `
                <div class="vital-sign-item">
                  <div class="vital-sign-label">${item.label}</div>
                  <div class="vital-sign-value">${item.value}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    }

    const medicalSections = [
      { title: 'Queixa Principal', content: recordData.chief_complaint },
      { title: 'História da Doença Atual', content: recordData.history_present_illness },
      { title: 'História Médica Pregressa', content: recordData.past_medical_history },
      { title: 'Medicamentos em Uso', content: recordData.medications },
      { title: 'Alergias', content: recordData.allergies },
      { title: 'Exame Físico', content: recordData.physical_examination },
      { title: 'Diagnóstico', content: recordData.diagnosis },
      { title: 'Plano de Tratamento', content: recordData.treatment_plan },
      { title: 'Observações Gerais', content: recordData.notes }
    ].filter(section => section.content && section.content.trim());

    const medicalSectionsHTML = medicalSections.map(section => `
      <div class="section">
        <h3>${section.title}</h3>
        <p>${section.content}</p>
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prontuário Médico - ${recordData.patient_name}</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            margin: 0;
            padding: 40px;
            background: white;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #c11c22;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px;
            font-weight: bold;
            text-transform: uppercase;
            margin: 30px 0;
            text-align: center;
        }
        .patient-info {
            background: #f9f9f9;
            padding: 15px;
            border-left: 4px solid #c11c22;
            margin: 20px 0;
        }
        .section {
            margin: 20px 0;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 5px;
            page-break-inside: avoid;
        }
        .section h3 {
            margin: 0 0 10px 0;
            color: #c11c22;
            font-size: 16px;
            border-bottom: 1px solid #eee;
            padding-bottom: 5px;
        }
        .vital-signs-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 10px;
            margin: 15px 0;
        }
        .vital-sign-item {
            text-align: center;
            padding: 10px;
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 4px;
        }
        .vital-sign-label {
            font-size: 11px;
            color: #666;
            margin-bottom: 5px;
        }
        .vital-sign-value {
            font-weight: bold;
            color: #c11c22;
        }
        .signature {
            margin-top: 60px;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #333;
            width: 300px;
            margin: 40px auto 10px;
        }
        .signature-image {
            max-width: 200px;
            max-height: 60px;
            margin: 20px auto 10px;
            display: block;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 20px;
        }
        @media print {
            body { margin: 0; padding: 20px; }
            .section { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Prontuário Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${recordData.patient_name}<br>
        <strong>Data do Atendimento:</strong> ${new Date(recordData.created_at).toLocaleDateString('pt-BR')}<br>
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    ${vitalSignsHTML}

    ${medicalSectionsHTML}

    ${medicalSections.length === 0 ? `
    <div class="section">
        <p><em>Prontuário médico sem informações clínicas detalhadas registradas.</em></p>
    </div>
    ` : ''}

    <div class="signature">
        ${signatureUrl ? 
          `<img src="${signatureUrl}" alt="Assinatura" class="signature-image" />` : 
          '<div class="signature-line"></div>'
        }
        <div class="signature-line"></div>
        <div>
            <strong>${professionalData.name}</strong><br>
            ${professionalData.specialty}<br>
            ${professionalData.crm ? `Registro: ${professionalData.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;
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

  const saveAsHTML = () => {
    const htmlContent = generateHTML();
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Prontuario_${recordData.patient_name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setSuccess('Prontuário salvo em HTML com sucesso!');
  };

  const saveAsPDF = async () => {
    try {
      setIsGeneratingPdf(true);
      setIsSaving(true);
      setError('');
      setSuccess('');

      console.log('🔄 Starting PDF generation process...');

      // Load html2pdf library
      await loadHtml2Pdf();

      // Generate HTML content
      const htmlContent = generateHTML();

      // Create a temporary container for the HTML content
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = htmlContent;
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '-9999px';
      tempContainer.style.width = '794px'; // A4 width in pixels
      tempContainer.style.height = 'auto';
      tempContainer.style.backgroundColor = '#ffffff';
      tempContainer.style.color = '#000000';
      tempContainer.style.fontFamily = 'Times New Roman, serif';
      tempContainer.style.fontSize = '14px';
      tempContainer.style.lineHeight = '1.6';
      tempContainer.style.padding = '20px';
      tempContainer.style.overflow = 'visible';
      tempContainer.style.zIndex = '-1';
      tempContainer.style.display = 'block';
      tempContainer.style.visibility = 'visible';
      document.body.appendChild(tempContainer);

      // Force styles on all elements to ensure visibility
      const allElements = tempContainer.querySelectorAll('*');
      allElements.forEach(el => {
        if (el instanceof HTMLElement) {
          el.style.color = '#000000';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
        }
      });

      // Configure PDF options
      const options = {
        margin: [10, 10, 10, 10],
        filename: `Prontuario_${recordData.patient_name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}.pdf`,
        image: { 
          type: 'jpeg', 
          quality: 0.98,
          crossOrigin: 'anonymous'
        },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          allowTaint: true,
          letterRendering: true,
          logging: false,
          backgroundColor: '#ffffff',
          removeContainer: true,
          imageTimeout: 0,
          foreignObjectRendering: false
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait',
          compress: true,
          precision: 2
        }
      };

      console.log('🔄 Generating PDF with options:', options);

      // Generate PDF
      const pdf = window.html2pdf()
        .set(options)
        .from(tempContainer);
        
      const pdfBlob = await pdf.outputPdf('blob');

      console.log('✅ PDF generated successfully, size:', pdfBlob.size);

      // Clean up temporary container
      document.body.removeChild(tempContainer);

      // Convert blob to base64 for backend
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];

          console.log('🔄 Saving PDF to backend...');

          // Save to backend using existing PDF route
          const token = localStorage.getItem('token');
          const apiUrl = getApiUrl();

          const response = await fetch(`${apiUrl}/api/pdf/save`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: `Prontuário Médico - ${recordData.patient_name}`,
              document_type: 'medical_record',
              patient_name: recordData.patient_name,
              patient_cpf: null,
              pdf_data: base64Data,
              document_metadata: {
                record_id: recordData.id,
                professional_name: professionalData.name,
                professional_specialty: professionalData.specialty,
                crm: professionalData.crm,
                generated_at: new Date().toISOString()
              },
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

  if (!isOpen) return null;

  const isProcessing = isGeneratingPdf || isSaving;
  const htmlContent = generateHTML();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center">
            <FileText className="h-6 w-6 text-red-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Preview do Prontuário Médico</h2>
              <p className="text-sm text-gray-600">
                Paciente: {recordData.patient_name}
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
              Visualização do prontuário médico
            </span>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={saveAsHTML}
              className="btn btn-secondary flex items-center"
              disabled={isProcessing}
            >
              <Download className="h-4 w-4 mr-2" />
              Salvar HTML
            </button>

            <button
              onClick={saveAsPDF}
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
                  ? 'Convertendo prontuário para PDF, aguarde...'
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

export default MedicalRecordPreviewModal;