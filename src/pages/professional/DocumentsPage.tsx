import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import DocumentViewModal from "../../components/DocumentViewModal";
import {
  FileText,
  Plus,
  Search,
  Calendar,
  X,
  User,
  Download,
  Eye,
  Trash2,
  Check,
  AlertCircle,
} from "lucide-react";
import DocumentPreview from "../../components/DocumentPreview";
import SimplePDFGenerator from "../../components/SimplePDFGenerator";

type DocumentType =
  | "certificate"
  | "prescription"
  | "consent_form"
  | "exam_request"
  | "declaration"
  | "lgpd"
  | "other";

type MedicalDocument = {
  id: number;
  title: string;
  document_type: DocumentType;
  patient_name: string;
  patient_cpf: string;
  document_url: string;
  created_at: string;
};

type PrivatePatient = {
  id: number;
  name: string;
  cpf: string;
};

const DocumentsPage: React.FC = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [patients, setPatients] = useState<PrivatePatient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<DocumentType | "">("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Document preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{
    title: string;
    htmlContent: string;
    documentData: any;
  } | null>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<MedicalDocument | null>(null);

  // Document view modal state
  const [showViewModal, setShowViewModal] = useState(false);
  const [documentToView, setDocumentToView] = useState<{
    url: string;
    title: string;
    type?: string;
  } | null>(null);

  // PDF generation state
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<number | null>(null);
  const [pdfError, setPdfError] = useState("");
  
  // Form state
  const [formData, setFormData] = useState({
    document_type: "certificate" as DocumentType,
    patient_id: "",
    title: "",
    description: "",
    cid: "",
    days: "",
    procedure: "",
    risks: "",
    prescription: "",
    content: "",
    professionalName: "",
    professionalSpecialty: "",
    crm: "",
  });

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

  const documentTypes = [
    { value: "certificate", label: "Atestado Médico", icon: "📋" },
    { value: "prescription", label: "Receituário", icon: "💊" },
    { value: "consent_form", label: "Termo de Consentimento", icon: "✍️" },
    { value: "exam_request", label: "Solicitação de Exames", icon: "🔬" },
    { value: "declaration", label: "Declaração", icon: "📄" },
    { value: "lgpd", label: "Termo LGPD", icon: "🔒" },
    { value: "other", label: "Outros", icon: "📁" },
  ];

  useEffect(() => {
    fetchData();
    loadProfessionalData();
  }, []);

  const loadProfessionalData = async () => {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const userResponse = await fetch(`${apiUrl}/api/users/${user?.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (userResponse.ok) {
        const userData = await userResponse.json();
        setFormData(prev => ({
          ...prev,
          professionalName: userData.name || user?.name || 'Profissional',
          professionalSpecialty: userData.category_name || '',
          crm: userData.crm || ''
        }));
      }
    } catch (error) {
      console.warn('Could not load professional data:', error);
    }
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError('');
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      console.log('🔄 [DOCUMENTS] Fetching medical documents from:', `${apiUrl}/api/documents/medical`);

      // Fetch documents
      const documentsResponse = await fetch(`${apiUrl}/api/documents/medical`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log('📡 [DOCUMENTS] Documents response status:', documentsResponse.status);

      if (documentsResponse.ok) {
        const documentsData = await documentsResponse.json();
        console.log('✅ [DOCUMENTS] Medical documents loaded:', documentsData.length);
        setDocuments(documentsData);
      } else {
        const errorData = await documentsResponse.json();
        throw new Error(errorData.message || 'Erro ao carregar documentos');
      }

      // Fetch patients
      const patientsResponse = await fetch(`${apiUrl}/api/private-patients`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (patientsResponse.ok) {
        const patientsData = await patientsResponse.json();
        console.log('✅ [DOCUMENTS] Private patients loaded:', patientsData.length);
        setPatients(patientsData);
      } else {
        console.warn('Could not load patients');
      }

    } catch (error) {
      console.error('❌ [DOCUMENTS] Error fetching data:', error);
      setError(error instanceof Error ? error.message : 'Erro ao carregar dados');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.patient_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !selectedType || doc.document_type === selectedType;
    return matchesSearch && matchesType;
  });

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePatientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const patientId = e.target.value;
    const patient = patients.find((p) => p.id.toString() === patientId);

    setFormData((prev) => ({
      ...prev,
      patient_id: patientId,
    }));
  };

  const openCreateModal = () => {
    setFormData({
      document_type: "certificate",
      patient_id: "",
      title: "",
      description: "",
      cid: "",
      days: "",
      procedure: "",
      risks: "",
      prescription: "",
      content: "",
      professionalName: formData.professionalName,
      professionalSpecialty: formData.professionalSpecialty,
      crm: formData.crm,
    });
    setError('');
    setSuccess('');
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError("");
    setSuccess("");

    console.log('🔄 [DOCUMENTS] Submitting document form:', formData);

    // Validate required fields
    if (!formData.title.trim()) {
      setError('Título é obrigatório');
      setIsCreating(false);
      return;
    }

    if (!formData.patient_id) {
      setError('Selecione um paciente');
      setIsCreating(false);
      return;
    }

    // Validate specific fields based on document type
    if (formData.document_type === 'certificate') {
      if (!formData.description.trim()) {
        setError('Descrição do atestado é obrigatória');
        setIsCreating(false);
        return;
      }
      if (!formData.days) {
        setError('Número de dias é obrigatório');
        setIsCreating(false);
        return;
      }
    } else if (formData.document_type === 'prescription') {
      if (!formData.prescription.trim()) {
        setError('Prescrição médica é obrigatória');
        setIsCreating(false);
        return;
      }
    } else if (formData.document_type === 'consent_form') {
      if (!formData.procedure.trim() || !formData.description.trim() || !formData.risks.trim()) {
        setError('Todos os campos do termo de consentimento são obrigatórios');
        setIsCreating(false);
        return;
      }
    } else if (!formData.content.trim()) {
      setError('Conteúdo do documento é obrigatório');
      setIsCreating(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();
      
      // Get selected patient
      const selectedPatient = patients.find(p => p.id.toString() === formData.patient_id);
      if (!selectedPatient) {
        setError('Paciente selecionado não encontrado');
        setIsCreating(false);
        return;
      }
      
      // Fetch signature
      let signatureUrl = null;
      try {
        const signatureResponse = await fetch(`${apiUrl}/api/professionals/${user?.id}/signature`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (signatureResponse.ok) {
          const signatureData = await signatureResponse.json();
          signatureUrl = signatureData.signature_url;
        }
      } catch (signatureError) {
        console.warn('Could not load signature:', signatureError);
      }

      // Enhanced form data with patient info
      const enhancedFormData = {
        ...formData,
        patientName: selectedPatient.name,
        patientCpf: selectedPatient.cpf,
        signatureUrl: signatureUrl
      };

      // Generate HTML content directly
      // Generate HTML content using inline templates (same as medical records)
      const htmlContent = generateDocumentHTMLInline(formData.document_type, enhancedFormData);

      console.log('✅ [DOCUMENTS] HTML content generated');

      // Set preview data and open preview modal
      setPreviewData({
        title: formData.title,
        htmlContent: htmlContent,
        documentData: {
          document_type: formData.document_type,
          patient_name: selectedPatient.name,
          patient_cpf: selectedPatient.cpf,
          professional_name: formData.professionalName,
          private_patient_id: parseInt(formData.patient_id),
          signatureUrl: signatureUrl,
          ...formData
        }
      });

      setShowPreview(true);
      closeModal();

      setSuccess("Documento gerado! Visualize e imprima em PDF.");
    } catch (error) {
      console.error('❌ [DOCUMENTS] Error in handleSubmit:', error);
      setError(
        error instanceof Error ? error.message : "Erro ao criar documento"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Função para gerar HTML do documento (igual aos prontuários)
  const generateDocumentHTML = (formData: any, patient: PrivatePatient, signatureUrl: string | null) => {
    const documentData = {
      patientName: patient.name,
      crm: formData.crm,
      signatureUrl: signatureUrl,
        ...formData,
    };

    // Generate HTML based on document type
    switch (formData.document_type) {
      case 'certificate':
        return generateCertificateHTML(documentData);
      case 'prescription':
        return generatePrescriptionHTML(documentData);
      case 'consent_form':
        return generateConsentFormHTML(documentData);
      case 'exam_request':
        return generateExamRequestHTML(documentData);
      case 'declaration':
        return generateDeclarationHTML(documentData);
      case 'lgpd':
        return generateLGPDHTML(documentData);
      default:
        return generateGenericHTML(documentData);
    }
  };

  // Templates de documentos (igual aos prontuários)
  const generateCertificateHTML = (data: any) => {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Atestado Médico - ${data.patientName}</title>
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
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px !important;
            font-weight: bold !important;
            color: #c11c22 !important;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px !important;
            font-weight: bold !important;
            text-transform: uppercase;
            margin: 30px 0 !important;
            text-align: center;
            color: #000000 !important;
        }
        .patient-info {
            background: #f9f9f9 !important;
            padding: 15px !important;
            border-left: 4px solid #c11c22 !important;
            margin: 20px 0 !important;
            border-radius: 4px;
        }
        .content {
            margin: 20px 0 !important;
            padding: 15px !important;
            border: 1px solid #ddd !important;
            border-radius: 5px;
            background: #ffffff !important;
        }
        .signature {
            margin-top: 60px !important;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #000000 !important;
            width: 300px;
            margin: 40px auto 10px !important;
        }
        .signature-image {
            max-width: 200px !important;
            max-height: 60px !important;
            margin: 20px auto 10px !important;
            display: block !important;
        }
        .footer {
            margin-top: 40px !important;
            text-align: center;
            font-size: 12px !important;
            color: #666666 !important;
            border-top: 1px solid #dddddd !important;
            padding-top: 20px !important;
        }
        * { color: #000000 !important; }
        h1, h2, h3, h4, h5, h6 { color: #c11c22 !important; }
        strong { font-weight: bold !important; color: #000000 !important; }
        @media print {
            body { margin: 0 !important; padding: 20px !important; background: #ffffff !important; }
            * { color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Atestado Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="content">
        <p>Atesto para os devidos fins que o(a) paciente acima identificado(a) esteve sob meus cuidados médicos e apresenta quadro clínico que o(a) impossibilita de exercer suas atividades habituais.</p>
        
        <p><strong>Descrição:</strong> ${data.description}</p>
        
        ${data.cid ? `<p><strong>CID:</strong> ${data.cid}</p>` : ''}
        
        <p><strong>Período de afastamento:</strong> ${data.days} dia(s) a partir de ${new Date().toLocaleDateString('pt-BR')}.</p>
        
        <p>Este atestado é válido para todos os fins legais e administrativos.</p>
    </div>

    <div class="signature">
        ${data.signatureUrl ? 
          `<img src="${data.signatureUrl}" alt="Assinatura" class="signature-image" />` : 
          '<div class="signature-line"></div>'
        }
        <div>
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty}<br>
            ${data.crm ? `Registro: ${data.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(function() {
                    window.close();
                }, 1000);
            }, 500);
        };
    </script>
</body>
</html>`;
  };

  const generatePrescriptionHTML = (data: any) => {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receituário Médico - ${data.patientName}</title>
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
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px !important;
            font-weight: bold !important;
            color: #c11c22 !important;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px !important;
            font-weight: bold !important;
            text-transform: uppercase;
            margin: 30px 0 !important;
            text-align: center;
            color: #000000 !important;
        }
        .patient-info {
            background: #f9f9f9 !important;
            padding: 15px !important;
            border-left: 4px solid #c11c22 !important;
            margin: 20px 0 !important;
            border-radius: 4px;
        }
        .prescription-box {
            border: 2px solid #c11c22 !important;
            padding: 20px !important;
            margin: 20px 0 !important;
            background: #ffffff !important;
            min-height: 150px;
        }
        .prescription-content {
            font-size: 16px !important;
            line-height: 2 !important;
            white-space: pre-line;
            color: #000000 !important;
        }
        .signature {
            margin-top: 60px !important;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #000000 !important;
            width: 300px;
            margin: 40px auto 10px !important;
        }
        .signature-image {
            max-width: 200px !important;
            max-height: 60px !important;
            margin: 20px auto 10px !important;
            display: block !important;
        }
        .footer {
            margin-top: 40px !important;
            text-align: center;
            font-size: 12px !important;
            color: #666666 !important;
            border-top: 1px solid #dddddd !important;
            padding-top: 20px !important;
        }
        * { color: #000000 !important; }
        h1, h2, h3, h4, h5, h6 { color: #c11c22 !important; }
        strong { font-weight: bold !important; color: #000000 !important; }
        @media print {
            body { margin: 0 !important; padding: 20px !important; background: #ffffff !important; }
            * { color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Receituário Médico</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="prescription-box">
        <div class="prescription-content">${data.prescription}</div>
    </div>

    <div class="signature">
        ${data.signatureUrl ? 
          `<img src="${data.signatureUrl}" alt="Assinatura" class="signature-image" />` : 
          '<div class="signature-line"></div>'
        }
        <div>
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty}<br>
            ${data.crm ? `Registro: ${data.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(function() {
                    window.close();
                }, 1000);
            }, 500);
        };
    </script>
</body>
</html>`;
  };

  const generateConsentFormHTML = (data: any) => {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Termo de Consentimento - ${data.patientName}</title>
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
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px !important;
            font-weight: bold !important;
            color: #c11c22 !important;
            margin-bottom: 10px;
        }
        .title {
            font-size: 18px !important;
            font-weight: bold !important;
            margin: 30px 0 !important;
            text-align: center;
            color: #000000 !important;
        }
        .patient-info {
            background: #f9f9f9 !important;
            padding: 15px !important;
            border-left: 4px solid #c11c22 !important;
            margin: 20px 0 !important;
            border-radius: 4px;
        }
        .section {
            margin: 20px 0 !important;
            padding: 15px !important;
            border: 1px solid #ddd !important;
            border-radius: 5px;
            background: #ffffff !important;
        }
        .section h3 {
            margin: 0 0 10px 0 !important;
            color: #c11c22 !important;
            font-size: 16px !important;
            font-weight: bold !important;
        }
        .dual-signature {
            margin-top: 60px !important;
            display: flex !important;
            justify-content: space-between !important;
        }
        .signature-box {
            text-align: center;
            width: 45% !important;
        }
        .footer {
            margin-top: 40px !important;
            text-align: center;
            font-size: 12px !important;
            color: #666666 !important;
            border-top: 1px solid #dddddd !important;
            padding-top: 20px !important;
        }
        * { color: #000000 !important; }
        h1, h2, h3, h4, h5, h6 { color: #c11c22 !important; }
        strong { font-weight: bold !important; color: #000000 !important; }
        p { margin: 10px 0 !important; text-align: justify; color: #000000 !important; }
        @media print {
            body { margin: 0 !important; padding: 20px !important; background: #ffffff !important; }
            * { color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Termo de Consentimento Livre e Esclarecido</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="section">
        <h3>Procedimento a ser realizado:</h3>
        <p><strong>${data.procedure}</strong></p>
        <p>${data.description}</p>
    </div>

    <div class="section">
        <h3>Riscos e Benefícios:</h3>
        <p>${data.risks}</p>
    </div>

    <div class="section">
        <h3>Declaração de Consentimento:</h3>
        <p>Declaro que fui devidamente informado(a) sobre o procedimento acima descrito, seus riscos, benefícios e alternativas. Todas as minhas dúvidas foram esclarecidas e consinto com a realização do procedimento.</p>
        <p>Estou ciente de que nenhum procedimento médico é 100% isento de riscos e que complicações podem ocorrer, mesmo com todos os cuidados técnicos adequados.</p>
        <p>Autorizo o profissional de saúde a realizar o procedimento proposto e declaro que este consentimento é dado de forma livre e esclarecida.</p>
    </div>

    <div class="dual-signature">
        <div class="signature-box">
            <div style="border-top: 1px solid #000; margin: 40px 0 10px;"></div>
            <div>
                <strong>Paciente ou Responsável</strong><br>
                ${data.patientName}
            </div>
        </div>
        
        <div class="signature-box">
            ${data.signatureUrl ? 
              `<img src="${data.signatureUrl}" alt="Assinatura" style="max-width: 150px; max-height: 50px; margin: 20px auto 10px; display: block;" />` : 
              '<div style="border-top: 1px solid #000; margin: 40px 0 10px;"></div>'
            }
            <div>
                <strong>Profissional Responsável</strong><br>
                ${data.professionalName}<br>
                ${data.crm ? `Registro: ${data.crm}` : ''}
            </div>
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(function() {
                    window.close();
                }, 1000);
            }, 500);
        };
    </script>
</body>
</html>`;
  };

  const generateExamRequestHTML = (data: any) => {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solicitação de Exames - ${data.patientName}</title>
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
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px !important;
            font-weight: bold !important;
            color: #c11c22 !important;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px !important;
            font-weight: bold !important;
            text-transform: uppercase;
            margin: 30px 0 !important;
            text-align: center;
            color: #000000 !important;
        }
        .patient-info {
            background: #f9f9f9 !important;
            padding: 15px !important;
            border-left: 4px solid #c11c22 !important;
            margin: 20px 0 !important;
            border-radius: 4px;
        }
        .exam-box {
            border: 2px solid #c11c22 !important;
            padding: 20px !important;
            margin: 20px 0 !important;
            background: #ffffff !important;
            min-height: 150px;
        }
        .exam-content {
            font-size: 16px !important;
            line-height: 2 !important;
            white-space: pre-line;
            color: #000000 !important;
        }
        .signature {
            margin-top: 60px !important;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #000000 !important;
            width: 300px;
            margin: 40px auto 10px !important;
        }
        .signature-image {
            max-width: 200px !important;
            max-height: 60px !important;
            margin: 20px auto 10px !important;
            display: block !important;
        }
        .footer {
            margin-top: 40px !important;
            text-align: center;
            font-size: 12px !important;
            color: #666666 !important;
            border-top: 1px solid #dddddd !important;
            padding-top: 20px !important;
        }
        * { color: #000000 !important; }
        h1, h2, h3, h4, h5, h6 { color: #c11c22 !important; }
        strong { font-weight: bold !important; color: #000000 !important; }
        @media print {
            body { margin: 0 !important; padding: 20px !important; background: #ffffff !important; }
            * { color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Solicitação de Exames</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="exam-box">
        <h3 style="margin: 0 0 15px 0; color: #c11c22; font-weight: bold;">Exames Solicitados:</h3>
        <div class="exam-content">${data.content}</div>
    </div>

    <div class="signature">
        ${data.signatureUrl ? 
          `<img src="${data.signatureUrl}" alt="Assinatura" class="signature-image" />` : 
          '<div class="signature-line"></div>'
        }
        <div>
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty}<br>
            ${data.crm ? `Registro: ${data.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(function() {
                    window.close();
                }, 1000);
            }, 500);
        };
    </script>
</body>
</html>`;
  };

  const generateDeclarationHTML = (data: any) => {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title} - ${data.patientName}</title>
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
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px !important;
            font-weight: bold !important;
            color: #c11c22 !important;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px !important;
            font-weight: bold !important;
            margin: 30px 0 !important;
            text-align: center;
            color: #000000 !important;
        }
        .patient-info {
            background: #f9f9f9 !important;
            padding: 15px !important;
            border-left: 4px solid #c11c22 !important;
            margin: 20px 0 !important;
            border-radius: 4px;
        }
        .content {
            margin: 30px 0 !important;
            padding: 15px !important;
            border: 1px solid #ddd !important;
            border-radius: 5px;
            background: #ffffff !important;
            min-height: 200px;
            white-space: pre-line;
        }
        .signature {
            margin-top: 60px !important;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #000000 !important;
            width: 300px;
            margin: 40px auto 10px !important;
        }
        .signature-image {
            max-width: 200px !important;
            max-height: 60px !important;
            margin: 20px auto 10px !important;
            display: block !important;
        }
        .footer {
            margin-top: 40px !important;
            text-align: center;
            font-size: 12px !important;
            color: #666666 !important;
            border-top: 1px solid #dddddd !important;
            padding-top: 20px !important;
        }
        * { color: #000000 !important; }
        h1, h2, h3, h4, h5, h6 { color: #c11c22 !important; }
        strong { font-weight: bold !important; color: #000000 !important; }
        p { margin: 10px 0 !important; text-align: justify; color: #000000 !important; }
        @media print {
            body { margin: 0 !important; padding: 20px !important; background: #ffffff !important; }
            * { color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">${data.title}</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="content">
        ${data.content}
    </div>

    <div class="signature">
        ${data.signatureUrl ? 
          `<img src="${data.signatureUrl}" alt="Assinatura" class="signature-image" />` : 
          '<div class="signature-line"></div>'
        }
        <div>
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty}<br>
            ${data.crm ? `Registro: ${data.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(function() {
                    window.close();
                }, 1000);
            }, 500);
        };
    </script>
</body>
</html>`;
  };

  const generateLGPDHTML = (data: any) => {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Termo LGPD - ${data.patientName}</title>
    <style>
        @page { size: A4; margin: 15mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Times New Roman', serif !important;
            font-size: 12px !important;
            line-height: 1.6 !important;
            color: #000000 !important;
            background: #ffffff !important;
            padding: 20px !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px !important;
            font-weight: bold !important;
            color: #c11c22 !important;
            margin-bottom: 10px;
        }
        .title {
            font-size: 18px !important;
            font-weight: bold !important;
            margin: 30px 0 !important;
            text-align: center;
            color: #000000 !important;
        }
        .patient-info {
            background: #f9f9f9 !important;
            padding: 15px !important;
            border-left: 4px solid #c11c22 !important;
            margin: 20px 0 !important;
            border-radius: 4px;
        }
        .section {
            margin: 15px 0 !important;
            padding: 10px !important;
            border: 1px solid #ddd !important;
            border-radius: 5px;
            background: #ffffff !important;
        }
        .section h4 {
            margin: 0 0 10px 0 !important;
            color: #c11c22 !important;
            font-size: 14px !important;
            font-weight: bold !important;
        }
        .dual-signature {
            margin-top: 60px !important;
            display: flex !important;
            justify-content: space-between !important;
        }
        .signature-box {
            text-align: center;
            width: 45% !important;
        }
        .footer {
            margin-top: 40px !important;
            text-align: center;
            font-size: 12px !important;
            color: #666666 !important;
            border-top: 1px solid #dddddd !important;
            padding-top: 20px !important;
        }
        * { color: #000000 !important; }
        h1, h2, h3, h4, h5, h6 { color: #c11c22 !important; }
        strong { font-weight: bold !important; color: #000000 !important; }
        p { margin: 10px 0 !important; text-align: justify; color: #000000 !important; }
        ul { margin: 10px 0 !important; padding-left: 20px !important; }
        li { margin: 5px 0 !important; color: #000000 !important; }
        @media print {
            body { margin: 0 !important; padding: 20px !important; background: #ffffff !important; }
            * { color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">Termo de Consentimento para Tratamento de Dados Pessoais (LGPD)</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="section">
        <h4>1. FINALIDADE DO TRATAMENTO DE DADOS</h4>
        <p>Os dados pessoais coletados serão utilizados exclusivamente para:</p>
        <ul>
            <li>Prestação de serviços de saúde e acompanhamento médico;</li>
            <li>Manutenção do histórico médico e prontuário;</li>
            <li>Comunicação sobre consultas e tratamentos;</li>
            <li>Cumprimento de obrigações legais e regulamentares.</li>
        </ul>
    </div>

    <div class="section">
        <h4>2. DADOS COLETADOS</h4>
        <p>Serão tratados dados pessoais como nome, CPF, endereço, telefone, email, informações de saúde e histórico médico.</p>
    </div>

    <div class="section">
        <h4>3. COMPARTILHAMENTO</h4>
        <p>Os dados não serão compartilhados com terceiros, exceto quando necessário para a prestação do serviço médico ou por determinação legal.</p>
    </div>

    <div class="section">
        <h4>4. DIREITOS DO TITULAR</h4>
        <p>Você tem direito a acessar, corrigir, excluir ou solicitar a portabilidade de seus dados, conforme a Lei Geral de Proteção de Dados (LGPD).</p>
    </div>

    <div class="section">
        <h4>5. CONSENTIMENTO</h4>
        <p>Ao assinar este termo, declaro que:</p>
        <ul>
            <li>Fui informado(a) sobre o tratamento dos meus dados pessoais;</li>
            <li>Compreendo as finalidades do tratamento;</li>
            <li>Consinto com o tratamento dos meus dados conforme descrito;</li>
            <li>Posso revogar este consentimento a qualquer momento.</li>
        </ul>
    </div>

    <div class="dual-signature">
        <div class="signature-box">
            <div style="border-top: 1px solid #000; margin: 40px 0 10px;"></div>
            <div>
                <strong>Paciente ou Responsável</strong><br>
                ${data.patientName}
            </div>
        </div>
        
        <div class="signature-box">
            ${data.signatureUrl ? 
              `<img src="${data.signatureUrl}" alt="Assinatura" style="max-width: 150px; max-height: 50px; margin: 20px auto 10px; display: block;" />` : 
              '<div style="border-top: 1px solid #000; margin: 40px 0 10px;"></div>'
            }
            <div>
                <strong>Profissional Responsável</strong><br>
                ${data.professionalName}<br>
                ${data.crm ? `Registro: ${data.crm}` : ''}
            </div>
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(function() {
                    window.close();
                }, 1000);
            }, 500);
        };
    </script>
</body>
</html>`;
  };

  const generateGenericHTML = (data: any) => {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title} - ${data.patientName}</title>
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
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px !important;
            font-weight: bold !important;
            color: #c11c22 !important;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px !important;
            font-weight: bold !important;
            margin: 30px 0 !important;
            text-align: center;
            color: #000000 !important;
        }
        .patient-info {
            background: #f9f9f9 !important;
            padding: 15px !important;
            border-left: 4px solid #c11c22 !important;
            margin: 20px 0 !important;
            border-radius: 4px;
        }
        .content {
            margin: 30px 0 !important;
            padding: 15px !important;
            border: 1px solid #ddd !important;
            border-radius: 5px;
            background: #ffffff !important;
            min-height: 200px;
            white-space: pre-line;
        }
        .signature {
            margin-top: 60px !important;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #000000 !important;
            width: 300px;
            margin: 40px auto 10px !important;
        }
        .signature-image {
            max-width: 200px !important;
            max-height: 60px !important;
            margin: 20px auto 10px !important;
            display: block !important;
        }
        .footer {
            margin-top: 40px !important;
            text-align: center;
            font-size: 12px !important;
            color: #666666 !important;
            border-top: 1px solid #dddddd !important;
            padding-top: 20px !important;
        }
        * { color: #000000 !important; }
        h1, h2, h3, h4, h5, h6 { color: #c11c22 !important; }
        strong { font-weight: bold !important; color: #000000 !important; }
        p { margin: 10px 0 !important; text-align: justify; color: #000000 !important; }
        @media print {
            body { margin: 0 !important; padding: 20px !important; background: #ffffff !important; }
            * { color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>

    <div class="title">${data.title}</div>

    <div class="patient-info">
        <strong>Paciente:</strong> ${data.patientName}<br>
        ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
        <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
    </div>

    <div class="content">
        ${data.content}
    </div>

    <div class="signature">
        ${data.signatureUrl ? 
          `<img src="${data.signatureUrl}" alt="Assinatura" class="signature-image" />` : 
          '<div class="signature-line"></div>'
        }
        <div>
            <strong>${data.professionalName}</strong><br>
            ${data.professionalSpecialty}<br>
            ${data.crm ? `Registro: ${data.crm}` : ''}
        </div>
    </div>

    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(function() {
                    window.close();
                }, 1000);
            }, 500);
        };
    </script>
</body>
</html>`;
  };

  // Função de impressão direta para documentos (igual aos prontuários)
  const printDocumentDirect = (document: MedicalDocument) => {
    try {
      console.log('🔄 Starting direct document print');
      
      // Buscar dados do paciente
      const patient = patients.find(p => p.name === document.patient_name);
      
      // Gerar HTML do documento baseado no tipo
      const documentData = {
        patientName: document.patient_name,
        patientCpf: document.patient_cpf || '',
        professionalName: formData.professionalName,
        professionalSpecialty: formData.professionalSpecialty,
        crm: formData.crm,
        signatureUrl: null, // Seria necessário buscar a assinatura
        title: document.title,
        // Dados específicos do documento seriam necessários do banco
        description: 'Documento gerado anteriormente',
        content: 'Conteúdo do documento',
        days: '1',
        prescription: 'Prescrição médica',
        procedure: 'Procedimento médico',
        risks: 'Riscos e benefícios'
      };

      let htmlContent = '';
      switch (document.document_type) {
        case 'certificate':
          htmlContent = generateCertificateHTML(documentData);
          break;
        case 'prescription':
          htmlContent = generatePrescriptionHTML(documentData);
          break;
        case 'consent_form':
          htmlContent = generateConsentFormHTML(documentData);
          break;
        case 'exam_request':
          htmlContent = generateExamRequestHTML(documentData);
          break;
        case 'declaration':
          htmlContent = generateDeclarationHTML(documentData);
          break;
        case 'lgpd':
          htmlContent = generateLGPDHTML(documentData);
          break;
        default:
          htmlContent = generateGenericHTML(documentData);
      }
      
      // Criar nova janela
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      if (!printWindow) {
        throw new Error('Popup foi bloqueado. Permita popups para imprimir.');
      }

      // Escrever e fechar documento
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      setSuccess('Janela de impressão aberta! Use Ctrl+P se necessário.');
      
    } catch (error) {
      console.error('Error printing document:', error);
      setError(error instanceof Error ? error.message : 'Erro ao imprimir documento');
    }
  };

  const handlePreviewClose = () => {
    setShowPreview(false);
    setPreviewData(null);
    // Refresh documents list after closing preview
    fetchData();
  };

  const openDocumentView = (document: MedicalDocument) => {
    setDocumentToView({
      url: document.document_url,
      title: document.title,
      type: document.document_url.toLowerCase().includes('.pdf') ? 'pdf' : 'html'
    });
    setShowViewModal(true);
  };

  const closeDocumentView = () => {
    setShowViewModal(false);
    setDocumentToView(null);
  };

  const confirmDelete = (document: MedicalDocument) => {
    setDocumentToDelete(document);
    setShowDeleteConfirm(true);
  };

  const cancelDelete = () => {
    setDocumentToDelete(null);
    setShowDeleteConfirm(false);
  };

  const generatePDFFromDocument = async (document: MedicalDocument) => {
    try {
      setIsGeneratingPdf(document.id);
      setPdfError("");
      setError("");

      console.log('🔄 [DOCUMENTS] Generating PDF for document:', document.id);

      // Load html2pdf library dynamically
      await loadHtml2Pdf();

      // Fetch the HTML content from the document URL
      const response = await fetch(document.document_url);
      if (!response.ok) {
        throw new Error('Não foi possível carregar o documento original');
      }

      const htmlContent = await response.text();
      console.log('✅ [DOCUMENTS] HTML content loaded for PDF generation');

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

      // Configure PDF options
      const options = {
        margin: [10, 10, 10, 10],
        filename: `${document.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}.pdf`,
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

      // Force styles on all elements to ensure visibility
      const allElements = tempContainer.querySelectorAll('*');
      allElements.forEach(el => {
        if (el instanceof HTMLElement) {
          el.style.color = '#000000';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
        }
      });

      console.log('🔄 [DOCUMENTS] Generating PDF with options:', options);

      // Generate and download PDF
      const pdf = window.html2pdf()
        .set(options)
        .from(tempContainer);
        
      await pdf.save();

      console.log('✅ [DOCUMENTS] PDF generated and downloaded successfully');

      // Clean up temporary container
      document.body.removeChild(tempContainer);

      setSuccess('PDF gerado e baixado com sucesso!');

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess('');
      }, 3000);

    } catch (error) {
      console.error('❌ [DOCUMENTS] Error generating PDF:', error);
      setPdfError(error instanceof Error ? error.message : 'Erro ao gerar PDF');
      
      // Clear error after 5 seconds
      setTimeout(() => {
        setPdfError('');
      }, 5000);
    } finally {
      setIsGeneratingPdf(null);
    }
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

  const deleteDocument = async () => {
    if (!documentToDelete) return;

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      console.log('🔄 [DOCUMENTS] Deleting document:', documentToDelete.id);

      const response = await fetch(`${apiUrl}/api/documents/medical/${documentToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('📡 [DOCUMENTS] Delete response:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao excluir documento');
      }

      console.log('✅ [DOCUMENTS] Document deleted successfully');
      await fetchData();
      setSuccess('Documento excluído com sucesso!');
    } catch (error) {
      console.error('❌ [DOCUMENTS] Error deleting document:', error);
      setError(error instanceof Error ? error.message : 'Erro ao excluir documento');
    } finally {
      setDocumentToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  const renderFormFields = () => {
    switch (formData.document_type) {
      case "certificate":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição do Atestado *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                className="input min-h-[100px]"
                placeholder="Descreva o motivo do atestado..."
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CID (opcional)
                </label>
                <input
                  type="text"
                  name="cid"
                  value={formData.cid}
                  onChange={handleInputChange}
                  className="input"
                  placeholder="Ex: M54.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dias de Afastamento *
                </label>
                <input
                  type="number"
                  name="days"
                  value={formData.days}
                  onChange={handleInputChange}
                  className="input"
                  min="1"
                  required
                />
              </div>
            </div>
          </>
        );

      case "prescription":
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Prescrição Médica *
            </label>
            <textarea
              name="prescription"
              value={formData.prescription}
              onChange={handleInputChange}
              className="input min-h-[200px]"
              placeholder="Digite a prescrição médica completa..."
              required
            />
          </div>
        );

      case "consent_form":
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Procedimento *
              </label>
              <input
                type="text"
                name="procedure"
                value={formData.procedure}
                onChange={handleInputChange}
                className="input"
                placeholder="Nome do procedimento"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição do Procedimento *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                className="input min-h-[100px]"
                placeholder="Descreva o procedimento..."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Riscos e Benefícios *
              </label>
              <textarea
                name="risks"
                value={formData.risks}
                onChange={handleInputChange}
                className="input min-h-[100px]"
                placeholder="Descreva os riscos e benefícios..."
                required
              />
            </div>
          </>
        );

      case "exam_request":
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Exames Solicitados *
            </label>
            <textarea
              name="content"
              value={formData.content}
              onChange={handleInputChange}
              className="input min-h-[200px]"
              placeholder="Liste os exames solicitados..."
              required
            />
          </div>
        );

      default:
        return (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conteúdo do Documento *
            </label>
            <textarea
              name="content"
              value={formData.content}
              onChange={handleInputChange}
              className="input min-h-[200px]"
              placeholder="Digite o conteúdo do documento..."
              required
            />
          </div>
        );
    }
  };

  // Generate HTML content inline (same logic as medical records)
  const generateDocumentHTMLInline = (documentType: DocumentType, data: any) => {
    const baseHTML = (title: string, content: string) => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
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
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 2px solid #c11c22;
            padding-bottom: 20px;
        }
        .logo {
            font-size: 24px !important;
            font-weight: bold !important;
            color: #c11c22 !important;
            margin-bottom: 10px;
        }
        .title {
            font-size: 20px !important;
            font-weight: bold !important;
            text-transform: uppercase;
            margin: 30px 0 !important;
            text-align: center;
            color: #000000 !important;
        }
        .patient-info {
            background: #f9f9f9 !important;
            padding: 15px !important;
            border-left: 4px solid #c11c22 !important;
            margin: 20px 0 !important;
            border-radius: 4px;
        }
        .content {
            margin: 30px 0 !important;
            text-align: justify;
            font-size: 14px !important;
            color: #000000 !important;
        }
        .prescription-box {
            border: 2px solid #c11c22 !important;
            padding: 20px !important;
            margin: 20px 0 !important;
            background: #ffffff !important;
            min-height: 150px;
        }
        .prescription-content {
            font-size: 16px !important;
            line-height: 2 !important;
            white-space: pre-line;
            color: #000000 !important;
        }
        .section {
            margin: 15px 0 !important;
            color: #000000 !important;
        }
        .section h3 {
            color: #c11c22 !important;
            margin-bottom: 10px !important;
            font-weight: bold !important;
        }
        .dual-signature {
            margin-top: 60px !important;
            display: flex !important;
            justify-content: space-between !important;
        }
        .signature-box {
            text-align: center;
            width: 45% !important;
        }
        .signature {
            margin-top: 60px !important;
            text-align: center;
        }
        .signature-line {
            border-top: 1px solid #000000 !important;
            width: 300px;
            margin: 40px auto 10px !important;
        }
        .signature-image {
            max-width: 200px !important;
            max-height: 60px !important;
            margin: 20px auto 10px !important;
            display: block !important;
        }
        .footer {
            margin-top: 40px !important;
            text-align: center;
            font-size: 12px !important;
            color: #666666 !important;
            border-top: 1px solid #dddddd !important;
            padding-top: 20px !important;
        }
        * { color: #000000 !important; }
        h1, h2, h3, h4, h5, h6 { color: #c11c22 !important; }
        strong { font-weight: bold !important; color: #000000 !important; }
        p { margin: 10px 0 !important; text-align: justify; color: #000000 !important; }
        ul { margin: 10px 0 !important; padding-left: 20px !important; }
        li { margin: 5px 0 !important; color: #000000 !important; }
        @media print {
            body { margin: 0 !important; padding: 20px !important; background: #ffffff !important; }
            * { color: #000000 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">CONVÊNIO QUIRO FERREIRA</div>
        <div>Sistema de Saúde e Bem-Estar</div>
    </div>
    ${content}
    <div class="footer">
        <p>Convênio Quiro Ferreira - Sistema de Saúde e Bem-Estar</p>
        <p>Telefone: (64) 98124-9199</p>
        <p>Este documento foi gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
</body>
</html>`;

    switch (documentType) {
      case 'certificate':
        const certificateContent = `
          <div class="title">Atestado Médico</div>
          <div class="patient-info">
              <strong>Paciente:</strong> ${data.patientName}<br>
              ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
              <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
          </div>
          <div class="content">
              <p>Atesto para os devidos fins que o(a) paciente acima identificado(a) esteve sob meus cuidados médicos e apresenta quadro clínico que o(a) impossibilita de exercer suas atividades habituais.</p>
              <p><strong>Descrição:</strong> ${data.description}</p>
              ${data.cid ? `<p><strong>CID:</strong> ${data.cid}</p>` : ''}
              <p><strong>Período de afastamento:</strong> ${data.days} dia(s) a partir de ${new Date().toLocaleDateString('pt-BR')}.</p>
              <p>Este atestado é válido para todos os fins legais e administrativos.</p>
          </div>
          <div class="signature">
              ${data.signatureUrl ? 
                `<img src="${data.signatureUrl}" alt="Assinatura" class="signature-image" />` : 
                '<div class="signature-line"></div>'
              }
              <div>
                  <strong>${data.professionalName}</strong><br>
                  ${data.professionalSpecialty}<br>
                  ${data.crm ? `Registro: ${data.crm}` : ''}
              </div>
          </div>
        `;
        return baseHTML('Atestado Médico', certificateContent);

      case 'prescription':
        const prescriptionContent = `
          <div class="title">Receituário Médico</div>
          <div class="patient-info">
              <strong>Paciente:</strong> ${data.patientName}<br>
              ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
              <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
          </div>
          <div class="prescription-box">
              <div class="prescription-content">${data.prescription}</div>
          </div>
          <div class="signature">
              ${data.signatureUrl ? 
                `<img src="${data.signatureUrl}" alt="Assinatura" class="signature-image" />` : 
                '<div class="signature-line"></div>'
              }
              <div>
                  <strong>${data.professionalName}</strong><br>
                  ${data.professionalSpecialty}<br>
                  ${data.crm ? `Registro: ${data.crm}` : ''}
              </div>
          </div>
        `;
        return baseHTML('Receituário Médico', prescriptionContent);

      case 'consent_form':
        const consentContent = `
          <div class="title">Termo de Consentimento Livre e Esclarecido</div>
          <div class="patient-info">
              <strong>Paciente:</strong> ${data.patientName}<br>
              ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
              <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}
          </div>
          <div class="section">
              <h3>Procedimento a ser realizado:</h3>
              <p><strong>${data.procedure}</strong></p>
              <p>${data.description}</p>
          </div>
          <div class="section">
              <h3>Riscos e Benefícios:</h3>
              <p>${data.risks}</p>
          </div>
          <div class="section">
              <h3>Declaração de Consentimento:</h3>
              <p>Declaro que fui devidamente informado(a) sobre o procedimento acima descrito, seus riscos, benefícios e alternativas. Todas as minhas dúvidas foram esclarecidas e consinto com a realização do procedimento.</p>
              <p>Estou ciente de que nenhum procedimento médico é 100% isento de riscos e que complicações podem ocorrer, mesmo com todos os cuidados técnicos adequados.</p>
              <p>Autorizo o profissional de saúde a realizar o procedimento proposto e declaro que este consentimento é dado de forma livre e esclarecida.</p>
          </div>
          <div class="dual-signature">
              <div class="signature-box">
                  <div style="border-top: 1px solid #000; margin: 40px 0 10px;"></div>
                  <div>
                      <strong>Paciente ou Responsável</strong><br>
                      ${data.patientName}
                  </div>
              </div>
              <div class="signature-box">
                  ${data.signatureUrl ? 
                    `<img src="${data.signatureUrl}" alt="Assinatura" style="max-width: 150px; max-height: 50px; margin: 20px auto 10px; display: block;" />` : 
                    '<div style="border-top: 1px solid #000; margin: 40px 0 10px;"></div>'
                  }
                  <div>
                      <strong>Profissional Responsável</strong><br>
                      ${data.professionalName}<br>
                      ${data.crm ? `Registro: ${data.crm}` : ''}
                  </div>
              </div>
          </div>
        `;
        return baseHTML('Termo de Consentimento', consentContent);

      case 'exam_request':
        const examContent = `
          <div class="title">Solicitação de Exames</div>
          <div class="patient-info">
              <strong>Paciente:</strong> ${data.patientName}<br>
              ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
              <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
          </div>
          <div class="prescription-box">
              <h3>Exames Solicitados:</h3>
              <div class="prescription-content">${data.content}</div>
          </div>
          <div class="signature">
              ${data.signatureUrl ? 
                `<img src="${data.signatureUrl}" alt="Assinatura" class="signature-image" />` : 
                '<div class="signature-line"></div>'
              }
              <div>
                  <strong>${data.professionalName}</strong><br>
                  ${data.professionalSpecialty}<br>
                  ${data.crm ? `Registro: ${data.crm}` : ''}
              </div>
          </div>
        `;
        return baseHTML('Solicitação de Exames', examContent);

      case 'lgpd':
        const lgpdContent = `
          <div class="title">Termo de Consentimento para Tratamento de Dados Pessoais (LGPD)</div>
          <div class="patient-info">
              <strong>Paciente:</strong> ${data.patientName}<br>
              ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
              <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}
          </div>
          <div class="section">
              <h3>1. FINALIDADE DO TRATAMENTO DE DADOS</h3>
              <p>Os dados pessoais coletados serão utilizados exclusivamente para:</p>
              <ul>
                  <li>Prestação de serviços de saúde e acompanhamento médico;</li>
                  <li>Manutenção do histórico médico e prontuário;</li>
                  <li>Comunicação sobre consultas e tratamentos;</li>
                  <li>Cumprimento de obrigações legais e regulamentares.</li>
              </ul>
          </div>
          <div class="section">
              <h3>2. DADOS COLETADOS</h3>
              <p>Serão tratados dados pessoais como nome, CPF, endereço, telefone, email, informações de saúde e histórico médico.</p>
          </div>
          <div class="section">
              <h3>3. COMPARTILHAMENTO</h3>
              <p>Os dados não serão compartilhados com terceiros, exceto quando necessário para a prestação do serviço médico ou por determinação legal.</p>
          </div>
          <div class="section">
              <h3>4. DIREITOS DO TITULAR</h3>
              <p>Você tem direito a acessar, corrigir, excluir ou solicitar a portabilidade de seus dados, conforme a Lei Geral de Proteção de Dados (LGPD).</p>
          </div>
          <div class="section">
              <h3>5. CONSENTIMENTO</h3>
              <p>Ao assinar este termo, declaro que:</p>
              <ul>
                  <li>Fui informado(a) sobre o tratamento dos meus dados pessoais;</li>
                  <li>Compreendo as finalidades do tratamento;</li>
                  <li>Consinto com o tratamento dos meus dados conforme descrito;</li>
                  <li>Posso revogar este consentimento a qualquer momento.</li>
              </ul>
          </div>
          <div class="dual-signature">
              <div class="signature-box">
                  <div style="border-top: 1px solid #000; margin: 40px 0 10px;"></div>
                  <div>
                      <strong>Paciente ou Responsável</strong><br>
                      ${data.patientName}
                  </div>
              </div>
              <div class="signature-box">
                  ${data.signatureUrl ? 
                    `<img src="${data.signatureUrl}" alt="Assinatura" style="max-width: 150px; max-height: 50px; margin: 20px auto 10px; display: block;" />` : 
                    '<div style="border-top: 1px solid #000; margin: 40px 0 10px;"></div>'
                  }
                  <div>
                      <strong>Profissional Responsável</strong><br>
                      ${data.professionalName}<br>
                      ${data.crm ? `Registro: ${data.crm}` : ''}
                  </div>
              </div>
          </div>
        `;
        return baseHTML('Termo LGPD', lgpdContent);

      default: // declaration and other
        const genericContent = `
          <div class="title">${data.title || 'Declaração Médica'}</div>
          <div class="patient-info">
              <strong>Paciente:</strong> ${data.patientName}<br>
              ${data.patientCpf ? `<strong>CPF:</strong> ${data.patientCpf}<br>` : ''}
              <strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}
          </div>
          <div class="content">
              <p>${data.content}</p>
          </div>
          <div class="signature">
              ${data.signatureUrl ? 
                `<img src="${data.signatureUrl}" alt="Assinatura" class="signature-image" />` : 
                '<div class="signature-line"></div>'
              }
              <div>
                  <strong>${data.professionalName}</strong><br>
                  ${data.professionalSpecialty}<br>
                  ${data.crm ? `Registro: ${data.crm}` : ''}
              </div>
          </div>
        `;
        return baseHTML(data.title || 'Declaração Médica', genericContent);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <FileText className="h-8 w-8 text-red-600 mr-3" />
            Documentos Médicos
          </h1>
          <p className="text-gray-600 mt-1">
            Gerencie atestados, receituários e outros documentos médicos
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="btn btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Documento
        </button>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-4 bg-green-50 text-green-600 p-3 rounded-lg flex items-center">
          <Check className="h-5 w-5 mr-2 flex-shrink-0" />
          {success}
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg flex items-center">
          <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      {pdfError && (
        <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg flex items-center">
          <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
          {pdfError}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Buscar por título ou paciente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as DocumentType | "")}
            className="input"
          >
            <option value="">Todos os tipos</option>
            {documentTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.icon} {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            <span className="ml-3 text-gray-600">Carregando documentos...</span>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhum documento encontrado
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || selectedType
                ? "Tente ajustar os filtros de busca"
                : "Comece criando seu primeiro documento médico"}
            </p>
            {!searchTerm && !selectedType && (
              <button
                onClick={openCreateModal}
                className="btn btn-primary"
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Documento
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Documento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paciente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDocuments.map((document) => {
                  const typeInfo = documentTypes.find(t => t.value === document.document_type) || 
                    { icon: "📄", label: "Documento" };
                  
                  return (
                    <tr key={document.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <FileText className="h-4 w-4 text-gray-400 mr-2" />
                          <div className="text-sm font-medium text-gray-900">
                            {document.title}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="h-4 w-4 text-gray-400 mr-2" />
                          <div>
                            <div className="text-sm text-gray-900">
                              {document.patient_name}
                            </div>
                            {document.patient_cpf && (
                              <div className="text-xs text-gray-500">
                                CPF: {document.patient_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                          {typeInfo.icon} {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-500">
                          <Calendar className="h-3 w-3 mr-1" />
                          {formatDate(document.created_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openDocumentView(document)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Visualizar"
                            disabled={isGeneratingPdf === document.id}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => printDocumentDirect(document)}
                            className={`text-green-600 hover:text-green-900 ${
                              isGeneratingPdf === document.id ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                            title="Imprimir PDF"
                            disabled={isGeneratingPdf === document.id}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <SimplePDFGenerator
                            htmlContent={document.document_url}
                            fileName={document.title}
                            title={document.title}
                            onSuccess={() => setSuccess('PDF gerado com sucesso!')}
                            onError={(error) => setPdfError(error)}
                          />
                          <SimplePDFGenerator
                            htmlContent={document.document_url}
                            fileName={document.title}
                            title={document.title}
                            onSuccess={() => setSuccess('PDF gerado com sucesso!')}
                            onError={(error) => setPdfError(error)}
                          />
                          <button
                            onClick={() => printDocumentDirect(document)}
                            className="text-purple-600 hover:text-purple-900"
                            title="Imprimir Direto"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                          <a
                            href={document.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:text-purple-900"
                            title="Abrir Original"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() => confirmDelete(document)}
                            className="text-red-600 hover:text-red-900"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create document modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Criar Novo Documento Médico</h2>
                <button
                  onClick={closeModal}
                  className="text-gray-500 hover:text-gray-700"
                  disabled={isCreating}
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-6 mt-4 bg-red-50 text-red-600 p-3 rounded-lg flex items-center">
                <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                {error}
              </div>
            )}

            {success && (
              <div className="mx-6 mt-4 bg-green-50 text-green-600 p-3 rounded-lg">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-6">
                {/* Document Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Documento *
                  </label>
                  <select
                    name="document_type"
                    value={formData.document_type}
                    onChange={handleInputChange}
                    className="input"
                    required
                  >
                    {documentTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.icon} {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Título do Documento *
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    className="input"
                    placeholder="Ex: Atestado Médico - João Silva"
                    required
                  />
                </div>

                {/* Patient Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Paciente *
                  </label>
                  <select
                    value={formData.patient_id}
                    onChange={handlePatientSelect}
                    className="input"
                    required
                  >
                    <option value="">Selecione um paciente</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name}
                        {patient.cpf && ` - CPF: ${patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Professional Information */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nome do Profissional *
                    </label>
                    <input
                      type="text"
                      name="professionalName"
                      value={formData.professionalName}
                      onChange={handleInputChange}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Especialidade
                    </label>
                    <input
                      type="text"
                      name="professionalSpecialty"
                      value={formData.professionalSpecialty}
                      onChange={handleInputChange}
                      className="input"
                      placeholder="Ex: Fisioterapeuta"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Registro Profissional *
                    </label>
                    <input
                      type="text"
                      name="crm"
                      value={formData.crm}
                      onChange={handleInputChange}
                      className="input"
                      placeholder="Ex: CREFITO 12345/GO, CRM 12345/GO"
                      required
                    />
                  </div>
                </div>

                {/* Dynamic form fields based on document type */}
                {renderFormFields()}
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-secondary"
                  disabled={isCreating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Gerando...
                    </>
                  ) : (
                    'Gerar Documento'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && documentToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Confirmar Exclusão
            </h3>
            <p className="text-gray-600 mb-6">
              Tem certeza que deseja excluir o documento "{documentToDelete.title}"?
              Esta ação não pode ser desfeita.
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                className="btn btn-secondary flex items-center"
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </button>
              <button
                onClick={deleteDocument}
                className="btn bg-red-600 text-white hover:bg-red-700 flex items-center"
              >
                <Check className="h-4 w-4 mr-2" />
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {showPreview && previewData && (
        <DocumentPreview
          isOpen={showPreview}
          onClose={handlePreviewClose}
          documentTitle={previewData.title}
          htmlContent={previewData.htmlContent}
          documentData={previewData.documentData}
        />
      )}

      {/* Document View Modal */}
      {showViewModal && documentToView && (
        <DocumentViewModal
          isOpen={showViewModal}
          onClose={closeDocumentView}
          documentUrl={documentToView.url}
          documentTitle={documentToView.title}
          documentType={documentToView.type}
        />
      )}
    </div>
  );
};

export default DocumentsPage;