import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import DocumentViewModal from '../../components/DocumentViewModal';
import {
  FileText,
  Plus,
  Search,
  User,
  Calendar,
  Edit,
  Trash2,
  Eye,
  X,
  Check,
  Download,
  Printer,
  AlertCircle,
  FileImage,
} from 'lucide-react';

type SavedDocument = {
  id: number;
  title: string;
  document_type: string;
  patient_name: string;
  patient_cpf: string;
  document_url: string;
  document_metadata: any;
  created_at: string;
};

type PrivatePatient = {
  id: number;
  name: string;
  cpf: string;
};

const DocumentsPage: React.FC = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<SavedDocument[]>([]);
  const [patients, setPatients] = useState<PrivatePatient[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<SavedDocument[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedDocument, setSelectedDocument] = useState<SavedDocument | null>(null);

  // Document view modal state
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [documentToView, setDocumentToView] = useState<{
    url: string;
    title: string;
    type?: string;
  } | null>(null);

  // Form state for document generation
  const [formData, setFormData] = useState({
    document_type: 'certificate',
    private_patient_id: '',
    title: '',
    description: '',
    days: '1',
    cid: '',
    prescription: '',
    procedure: '',
    risks: '',
    content: '',
  });

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<SavedDocument | null>(null);

  // Professional data
  const [professionalData, setProfessionalData] = useState({
    name: '',
    specialty: '',
    crm: '',
    signatureUrl: null as string | null,
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

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let filtered = documents;

    if (searchTerm) {
      filtered = filtered.filter(
        (doc) =>
          doc.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          doc.document_type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedPatient) {
      filtered = filtered.filter(
        (doc) => doc.patient_name === patients.find((p) => p.id.toString() === selectedPatient)?.name
      );
    }

    if (selectedDocumentType) {
      filtered = filtered.filter((doc) => doc.document_type === selectedDocumentType);
    }

    setFilteredDocuments(filtered);
  }, [searchTerm, selectedPatient, selectedDocumentType, documents, patients]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      // Fetch professional data
      const userResponse = await fetch(`${apiUrl}/api/users/${user?.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (userResponse.ok) {
        const userData = await userResponse.json();
        setProfessionalData({
          name: userData.name || user?.name || 'Profissional',
          specialty: userData.category_name || '',
          crm: userData.crm || '',
          signatureUrl: userData.signature_url || null,
        });
      }

      // Fetch saved documents
      console.log('🔄 [DOCUMENTS] Fetching medical documents from:', `${apiUrl}/api/documents/medical`);
      
      const documentsResponse = await fetch(`${apiUrl}/api/documents/medical`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('📡 [DOCUMENTS] Medical documents response status:', documentsResponse.status);

      if (documentsResponse.ok) {
        const documentsData = await documentsResponse.json();
        console.log('✅ [DOCUMENTS] Medical documents loaded:', documentsData.length);
        setDocuments(documentsData);
      } else {
        console.warn('⚠️ [DOCUMENTS] Medical documents not available:', documentsResponse.status);
        setDocuments([]);
      }

      // Fetch patients
      const patientsResponse = await fetch(`${apiUrl}/api/private-patients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (patientsResponse.ok) {
        const patientsData = await patientsResponse.json();
        setPatients(patientsData);
      }
    } catch (error) {
      console.error('❌ [DOCUMENTS] Error fetching data:', error);
      setError('Não foi possível carregar os dados');
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setFormData({
      document_type: 'certificate',
      private_patient_id: '',
      title: '',
      description: '',
      days: '1',
      cid: '',
      prescription: '',
      procedure: '',
      risks: '',
      content: '',
    });
    setSelectedDocument(null);
    setIsModalOpen(true);
  };

  const openViewModal = (document: SavedDocument) => {
    setDocumentToView({
      url: document.document_url,
      title: document.title,
      type: document.document_type,
    });
    setIsViewModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsViewModalOpen(false);
    setError('');
    setSuccess('');
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      // Get patient data
      const patient = patients.find((p) => p.id.toString() === formData.private_patient_id);
      if (!patient) {
        setError('Paciente não encontrado');
        return;
      }

      // Prepare template data based on document type
      const templateData = {
        patientName: patient.name,
        patientCpf: patient.cpf || '',
        professionalName: professionalData.name,
        professionalSpecialty: professionalData.specialty,
        crm: professionalData.crm,
        signatureUrl: professionalData.signatureUrl,
        title: formData.title,
        description: formData.description,
        days: formData.days,
        cid: formData.cid,
        prescription: formData.prescription,
        procedure: formData.procedure,
        risks: formData.risks,
        content: formData.content,
      };

      // Generate document using the documents route
      const response = await fetch(`${apiUrl}/api/documents/medical`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title,
          document_type: formData.document_type,
          private_patient_id: parseInt(formData.private_patient_id),
          template_data: templateData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao gerar documento');
      }

      const result = await response.json();
      console.log('✅ [DOCUMENTS] Document generated:', result);

      setSuccess('Documento gerado com sucesso!');
      await fetchData();

      setTimeout(() => {
        closeModal();
      }, 1500);
    } catch (error) {
      console.error('❌ [DOCUMENTS] Error generating document:', error);
      setError(error instanceof Error ? error.message : 'Erro ao gerar documento');
    }
  };

  const confirmDelete = (document: SavedDocument) => {
    setDocumentToDelete(document);
    setShowDeleteConfirm(true);
  };

  const cancelDelete = () => {
    setDocumentToDelete(null);
    setShowDeleteConfirm(false);
  };

  const deleteDocument = async () => {
    if (!documentToDelete) return;

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      console.log('🔄 [DOCUMENTS] Deleting medical document:', documentToDelete.id);

      const response = await fetch(`${apiUrl}/api/documents/medical/${documentToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao excluir documento médico');
      }

      console.log('✅ [DOCUMENTS] Medical document deleted successfully');
      await fetchData();
      setSuccess('Documento médico excluído com sucesso!');
    } catch (error) {
      console.error('❌ [DOCUMENTS] Error deleting medical document:', error);
      setError(error instanceof Error ? error.message : 'Erro ao excluir documento médico');
    } finally {
      setDocumentToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  // Função de impressão direta para documentos (igual aos prontuários)
  const printDocumentDirect = (document: SavedDocument) => {
    try {
      console.log('🔄 Starting direct document print for:', document.title);
      
      // Create a new window for printing
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      if (!printWindow) {
        throw new Error('Popup foi bloqueado. Permita popups para imprimir.');
      }

      // If it's an HTML document, fetch and print it
      if (document.document_url.includes('.html')) {
        fetch(document.document_url)
          .then(response => response.text())
          .then(htmlContent => {
            // Write the HTML content directly
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            
            // Auto-print when loaded
            printWindow.onload = () => {
              setTimeout(() => {
                printWindow.print();
                setTimeout(() => {
                  printWindow.close();
                }, 1000);
              }, 500);
            };
          })
          .catch(error => {
            console.error('Error fetching document:', error);
            printWindow.close();
            setError('Erro ao carregar documento para impressão');
          });
      } else {
        // For PDF documents, just open in new window
        printWindow.location.href = document.document_url;
      }
      
      setSuccess('Janela de impressão aberta! Use Ctrl+P se necessário.');
      
    } catch (error) {
      console.error('Error printing document:', error);
      setError(error instanceof Error ? error.message : 'Erro ao imprimir documento');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDocumentTypeDisplay = (type: string) => {
    const types = {
      certificate: 'Atestado',
      prescription: 'Receituário',
      consent_form: 'Termo de Consentimento',
      exam_request: 'Solicitação de Exames',
      declaration: 'Declaração',
      lgpd: 'Termo LGPD',
      other: 'Outro',
    };
    return types[type as keyof typeof types] || type;
  };

  const getDocumentTypeColor = (type: string) => {
    const colors = {
      certificate: 'bg-blue-100 text-blue-800',
      prescription: 'bg-green-100 text-green-800',
      consent_form: 'bg-purple-100 text-purple-800',
      exam_request: 'bg-yellow-100 text-yellow-800',
      declaration: 'bg-orange-100 text-orange-800',
      lgpd: 'bg-red-100 text-red-800',
      other: 'bg-gray-100 text-gray-800',
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const documentTypes = [
    { value: '', label: 'Todos os tipos' },
    { value: 'certificate', label: 'Atestados' },
    { value: 'prescription', label: 'Receituários' },
    { value: 'consent_form', label: 'Termos de Consentimento' },
    { value: 'exam_request', label: 'Solicitações de Exames' },
    { value: 'declaration', label: 'Declarações' },
    { value: 'lgpd', label: 'Termos LGPD' },
    { value: 'other', label: 'Outros' },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documentos Médicos</h1>
          <p className="text-gray-600">Gerencie os documentos dos seus pacientes</p>
        </div>

        <button
          onClick={openCreateModal}
          className="btn btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Documento
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por paciente, título ou tipo..."
            className="input pl-10"
          />
        </div>

        <select
          value={selectedPatient}
          onChange={(e) => setSelectedPatient(e.target.value)}
          className="input"
        >
          <option value="">Todos os pacientes</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.name}
            </option>
          ))}
        </select>

        <select
          value={selectedDocumentType}
          onChange={(e) => setSelectedDocumentType(e.target.value)}
          className="input"
        >
          {documentTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 flex items-center">
          <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-6">
          {success}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando documentos...</p>
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || selectedPatient || selectedDocumentType
                ? 'Nenhum documento encontrado'
                : 'Nenhum documento cadastrado'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || selectedPatient || selectedDocumentType
                ? 'Tente ajustar os filtros de busca.'
                : 'Comece criando o primeiro documento médico.'}
            </p>
            {!searchTerm && !selectedPatient && !selectedDocumentType && (
              <button
                onClick={openCreateModal}
                className="btn btn-primary inline-flex items-center"
              >
                <Plus className="h-5 w-5 mr-2" />
                Criar Primeiro Documento
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paciente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Título
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
                {filteredDocuments.map((document) => (
                  <tr key={document.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                            <User className="h-5 w-5 text-red-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {document.patient_name}
                          </div>
                          {document.patient_cpf && (
                            <div className="text-sm text-gray-500">
                              CPF: {document.patient_cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {document.title || 'Sem título'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getDocumentTypeColor(document.document_type)}`}>
                        {getDocumentTypeDisplay(document.document_type)}
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
                          onClick={() => openViewModal(document)}
                          className="text-gray-600 hover:text-gray-900"
                          title="Visualizar"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => printDocumentDirect(document)}
                          className="text-green-600 hover:text-green-900"
                          title="Imprimir"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => window.open(document.document_url, '_blank')}
                          className="text-blue-600 hover:text-blue-900"
                          title="Baixar"
                        >
                          <Download className="h-4 w-4" />
                        </button>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Document generation modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">Gerar Novo Documento</h2>
            </div>

            {error && (
              <div className="mx-6 mt-4 bg-red-50 text-red-600 p-3 rounded-lg">
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
                    <option value="certificate">Atestado Médico</option>
                    <option value="prescription">Receituário</option>
                    <option value="consent_form">Termo de Consentimento</option>
                    <option value="exam_request">Solicitação de Exames</option>
                    <option value="declaration">Declaração</option>
                    <option value="lgpd">Termo LGPD</option>
                    <option value="other">Outro</option>
                  </select>
                </div>

                {/* Patient Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Paciente *
                  </label>
                  <select
                    name="private_patient_id"
                    value={formData.private_patient_id}
                    onChange={handleInputChange}
                    className="input"
                    required
                  >
                    <option value="">Selecione um paciente</option>
                    {patients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name}
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
                    placeholder="Ex: Atestado médico para afastamento"
                    required
                  />
                </div>

                {/* Dynamic fields based on document type */}
                {formData.document_type === 'certificate' && (
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Número de Dias *
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
                    </div>
                  </>
                )}

                {formData.document_type === 'prescription' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prescrição *
                    </label>
                    <textarea
                      name="prescription"
                      value={formData.prescription}
                      onChange={handleInputChange}
                      className="input min-h-[150px]"
                      placeholder="Digite a prescrição médica..."
                      required
                    />
                  </div>
                )}

                {formData.document_type === 'consent_form' && (
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
                )}

                {(formData.document_type === 'exam_request' || 
                  formData.document_type === 'declaration' || 
                  formData.document_type === 'other') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Conteúdo *
                    </label>
                    <textarea
                      name="content"
                      value={formData.content}
                      onChange={handleInputChange}
                      className="input min-h-[150px]"
                      placeholder={
                        formData.document_type === 'exam_request'
                          ? 'Liste os exames solicitados...'
                          : 'Digite o conteúdo do documento...'
                      }
                      required
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Gerar Documento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document view modal */}
      <DocumentViewModal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        documentUrl={documentToView?.url || ''}
        documentTitle={documentToView?.title || ''}
        documentType={documentToView?.type}
      />

      {/* Delete confirmation modal */}
      {showDeleteConfirm && documentToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center">
              <AlertCircle className="h-6 w-6 text-red-600 mr-2" />
              Confirmar Exclusão
            </h2>

            <p className="mb-6">
              Tem certeza que deseja excluir o documento{' '}
              <strong>{documentToDelete.title}</strong>? Esta ação não pode ser desfeita.
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
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;