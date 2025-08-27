import React, { useState, useEffect } from 'react';
import { Calendar, Edit, Trash2, Plus, Repeat, Search, Filter, User, Users, Clock, CheckCircle, XCircle, Check, X, AlertCircle, MessageCircle } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import RecurringConsultationModal from '../../components/RecurringConsultationModal';
import EditConsultationModal from '../../components/EditConsultationModal';

type Consultation = {
  id: number;
  date: string;
  client_name: string;
  service_name: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  value: number;
  notes?: string;
  is_dependent: boolean;
  patient_type: 'convenio' | 'private';
  location_name?: string;
  is_recurring?: boolean;
  recurring_group_id?: number;
};

const ConsultationManagementPage: React.FC = () => {
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [filteredConsultations, setFilteredConsultations] = useState<Consultation[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [patientTypeFilter, setPatientTypeFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal states
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [consultationToDelete, setConsultationToDelete] = useState<Consultation | null>(null);

  // WhatsApp state
  const [sendingWhatsApp, setSendingWhatsApp] = useState<number | null>(null);
  const [whatsAppError, setWhatsAppError] = useState('');

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
    fetchConsultations();
  }, [selectedDate]);

  useEffect(() => {
    let filtered = consultations;

    if (searchTerm) {
      filtered = filtered.filter(consultation =>
        consultation.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        consultation.service_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter) {
      filtered = filtered.filter(consultation => consultation.status === statusFilter);
    }

    if (patientTypeFilter) {
      filtered = filtered.filter(consultation => consultation.patient_type === patientTypeFilter);
    }

    setFilteredConsultations(filtered);
  }, [consultations, searchTerm, statusFilter, patientTypeFilter]);

  const fetchConsultations = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();
      const dateStr = format(selectedDate, 'yyyy-MM-dd');

      console.log('🔄 Fetching consultations for date:', dateStr);

      const response = await fetch(
        `${apiUrl}/api/consultations/agenda?date=${dateStr}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const consultationsData = await response.json();
        console.log('✅ Consultations loaded:', consultationsData.length);
        setConsultations(consultationsData);
      } else {
        console.error('Consultations response error:', response.status);
        setConsultations([]);
      }
    } catch (error) {
      console.error('Error fetching consultations:', error);
      setError('Não foi possível carregar as consultas');
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = (consultation: Consultation) => {
    setSelectedConsultation(consultation);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setSelectedConsultation(null);
  };

  const handleEditSuccess = () => {
    fetchConsultations();
    setSuccess('Consulta atualizada com sucesso!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleRecurringSuccess = () => {
    fetchConsultations();
    setSuccess('Consultas recorrentes criadas com sucesso!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const confirmDelete = (consultation: Consultation) => {
    setConsultationToDelete(consultation);
    setShowDeleteConfirm(true);
  };

  const cancelDelete = () => {
    setConsultationToDelete(null);
    setShowDeleteConfirm(false);
  };

  const deleteConsultation = async () => {
    if (!consultationToDelete) return;

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/api/consultations/${consultationToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao excluir consulta');
      }

      await fetchConsultations();
      setSuccess('Consulta excluída com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao excluir consulta');
    } finally {
      setConsultationToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  const sendWhatsAppMessage = async (consultation: Consultation) => {
    try {
      setSendingWhatsApp(consultation.id);
      setWhatsAppError('');
      setError('');

      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      console.log('🔄 Fetching client phone for consultation:', consultation.id);

      // Get client phone number
      const response = await fetch(
        `${apiUrl}/api/consultations/${consultation.id}/client-phone`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Não foi possível obter o telefone do cliente');
      }

      const data = await response.json();
      const clientPhone = data.phone;

      if (!clientPhone) {
        throw new Error('Cliente não possui telefone cadastrado');
      }

      // Clean phone number (remove non-numeric characters)
      const cleanPhone = clientPhone.replace(/\D/g, '');
      
      // Ensure phone has country code (55 for Brazil)
      const phoneWithCountryCode = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      // Format consultation date and time
      const consultationDate = new Date(consultation.date);
      const formattedDate = format(consultationDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      const formattedTime = format(consultationDate, 'HH:mm');

      // Create WhatsApp message
      const message = `🏥 *Confirmação de Consulta - Convênio Quiro Ferreira*

Olá, ${consultation.client_name}! 👋

Sua consulta foi confirmada com os seguintes detalhes:

📅 *Data:* ${formattedDate}
⏰ *Horário:* ${formattedTime}
🩺 *Serviço:* ${consultation.service_name}
${consultation.location_name ? `📍 *Local:* ${consultation.location_name}` : ''}
💰 *Valor:* ${formatCurrency(consultation.value)}

${consultation.notes && consultation.notes.trim() ? `📝 *Observações:* ${consultation.notes.trim()}\n\n` : ''}Por favor, chegue com 15 minutos de antecedência.

Em caso de dúvidas ou necessidade de reagendamento, entre em contato conosco.

Atenciosamente,
Equipe Convênio Quiro Ferreira 🌟`;

      // Encode message for URL
      const encodedMessage = encodeURIComponent(message);
      
      // Create WhatsApp URL
      const whatsappUrl = `https://wa.me/${phoneWithCountryCode}?text=${encodedMessage}`;
      
      console.log('✅ Opening WhatsApp with URL:', whatsappUrl);
      
      // Open WhatsApp in new tab
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      
      setSuccess(`Mensagem do WhatsApp aberta para ${consultation.client_name}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao enviar mensagem';
      setWhatsAppError(errorMessage);
      setError(errorMessage);
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'scheduled':
        return {
          text: 'Agendado',
          className: 'bg-blue-100 text-blue-800',
          icon: <Clock className="h-3 w-3 mr-1" />,
        };
      case 'confirmed':
        return {
          text: 'Confirmado',
          className: 'bg-green-100 text-green-800',
          icon: <CheckCircle className="h-3 w-3 mr-1" />,
        };
      case 'completed':
        return {
          text: 'Concluído',
          className: 'bg-gray-100 text-gray-800',
          icon: <Check className="h-3 w-3 mr-1" />,
        };
      case 'cancelled':
        return {
          text: 'Cancelado',
          className: 'bg-red-100 text-red-800',
          icon: <XCircle className="h-3 w-3 mr-1" />,
        };
      default:
        return {
          text: 'Desconhecido',
          className: 'bg-gray-100 text-gray-800',
          icon: <AlertCircle className="h-3 w-3 mr-1" />,
        };
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatTime = (dateString: string) => {
    return format(new Date(dateString), 'HH:mm');
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setPatientTypeFilter('');
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gerenciar Consultas</h1>
          <p className="text-gray-600">Edite, exclua e crie consultas recorrentes</p>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setShowRecurringModal(true)}
            className="btn btn-outline flex items-center"
          >
            <Repeat className="h-5 w-5 mr-2" />
            Consultas Recorrentes
          </button>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedDate(subDays(selectedDate, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Calendar className="h-5 w-5" />
          </button>

          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </h2>
            <p className="text-sm text-gray-600">
              {consultations.length} consulta(s)
            </p>
          </div>

          <button
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Calendar className="h-5 w-5" />
          </button>
        </div>

        <div className="flex justify-center mt-4">
          <button
            onClick={() => setSelectedDate(new Date())}
            className="btn btn-secondary"
          >
            Hoje
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center mb-4">
          <Filter className="h-5 w-5 text-red-600 mr-2" />
          <h2 className="text-lg font-semibold">Filtros</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por paciente ou serviço..."
              className="input pl-10"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input"
          >
            <option value="">Todos os status</option>
            <option value="scheduled">Agendado</option>
            <option value="confirmed">Confirmado</option>
            <option value="completed">Concluído</option>
            <option value="cancelled">Cancelado</option>
          </select>

          <select
            value={patientTypeFilter}
            onChange={(e) => setPatientTypeFilter(e.target.value)}
            className="input"
          >
            <option value="">Todos os tipos</option>
            <option value="convenio">Convênio</option>
            <option value="private">Particular</option>
          </select>

          <button
            onClick={resetFilters}
            className="btn btn-secondary"
          >
            Limpar Filtros
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 flex items-center">
          <AlertCircle className="h-5 w-5 mr-2" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-6 flex items-center">
          <Check className="h-5 w-5 mr-2" />
          {success}
        </div>
      )}

      {/* Consultations List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando consultas...</p>
          </div>
        ) : filteredConsultations.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || statusFilter || patientTypeFilter
                ? 'Nenhuma consulta encontrada'
                : 'Nenhuma consulta para este dia'
              }
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || statusFilter || patientTypeFilter
                ? 'Tente ajustar os filtros de busca.'
                : `Sua agenda está livre para ${format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}`
              }
            </p>
            {!searchTerm && !statusFilter && !patientTypeFilter && (
              <button
                onClick={() => setShowRecurringModal(true)}
                className="btn btn-primary inline-flex items-center"
              >
                <Repeat className="h-5 w-5 mr-2" />
                Criar Consultas Recorrentes
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Horário
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Paciente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Serviço
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Local
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredConsultations.map((consultation) => {
                  const statusInfo = getStatusInfo(consultation.status);
                  return (
                    <tr key={consultation.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">
                            {formatTime(consultation.date)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {consultation.is_dependent ? (
                            <Users className="h-4 w-4 text-blue-600 mr-2" />
                          ) : consultation.patient_type === 'private' ? (
                            <User className="h-4 w-4 text-purple-600 mr-2" />
                          ) : (
                            <User className="h-4 w-4 text-green-600 mr-2" />
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {consultation.client_name}
                            </div>
                            <div className="flex items-center space-x-2">
                              {consultation.is_dependent && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                  Dependente
                                </span>
                              )}
                              {consultation.patient_type === 'private' && (
                                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                                  Particular
                                </span>
                              )}
                              {consultation.is_recurring && (
                                <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs flex items-center">
                                  <Repeat className="h-3 w-3 mr-1" />
                                  Recorrente
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{consultation.service_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full flex items-center w-fit ${statusInfo.className}`}>
                          {statusInfo.icon}
                          {statusInfo.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(consultation.value)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {consultation.location_name || 'Não informado'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => sendWhatsAppMessage(consultation)}
                            className={`text-green-600 hover:text-green-900 ${
                              sendingWhatsApp === consultation.id ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                            title="Enviar confirmação via WhatsApp"
                            disabled={sendingWhatsApp === consultation.id}
                          >
                            {sendingWhatsApp === consultation.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                            ) : (
                              <MessageCircle className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => openEditModal(consultation)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(consultation)}
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

      {/* Recurring Consultation Modal */}
      <RecurringConsultationModal
        isOpen={showRecurringModal}
        onClose={() => setShowRecurringModal(false)}
        onSuccess={handleRecurringSuccess}
      />

      {/* Edit Consultation Modal */}
      <EditConsultationModal
        isOpen={showEditModal}
        consultation={selectedConsultation}
        onClose={closeEditModal}
        onSuccess={handleEditSuccess}
      />

      {/* Delete confirmation modal */}
      {showDeleteConfirm && consultationToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4 flex items-center">
              <AlertCircle className="h-6 w-6 text-red-600 mr-2" />
              Confirmar Exclusão
            </h2>
            
            <p className="mb-6">
              Tem certeza que deseja excluir a consulta de <strong>{consultationToDelete.client_name}</strong>?
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
                onClick={deleteConsultation}
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

export default ConsultationManagementPage;