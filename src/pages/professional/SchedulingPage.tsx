import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  Calendar,
  Clock,
  Plus,
  Edit,
  Trash2,
  User,
  Users,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings,
  Repeat,
  Eye,
  RefreshCw,
  MapPin,
  Phone
} from 'lucide-react';
import SchedulingAccessPayment from '../../components/SchedulingAccessPayment';
import QuickScheduleModal from '../../components/QuickScheduleModal';
import EditConsultationModal from '../../components/EditConsultationModal';
import CancelConsultationModal from '../../components/CancelConsultationModal';
import RecurringConsultationModal from '../../components/RecurringConsultationModal';
import SlotCustomizationModal from '../../components/SlotCustomizationModal';
import CancelledConsultationsModal from '../../components/CancelledConsultationsModal';
import { validateTimeSlot, getValidTimeSlots, type SlotDuration } from '../../utils/timeSlotValidation';

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
};

type SchedulingAccess = {
  hasAccess: boolean;
  expiresAt: string | null;
  reason: string | null;
};

const SchedulingPage: React.FC = () => {
  const { user } = useAuth();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedView, setSelectedView] = useState<'day' | 'week' | 'month'>('day');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Access control state
  const [schedulingAccess, setSchedulingAccess] = useState<SchedulingAccess>({
    hasAccess: false,
    expiresAt: null,
    reason: null
  });
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState('');

  // Modal states
  const [showQuickSchedule, setShowQuickSchedule] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [showSlotCustomization, setShowSlotCustomization] = useState(false);
  const [showCancelledModal, setShowCancelledModal] = useState(false);
  
  // Selected items
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);
  
  // Slot configuration
  const [slotDuration, setSlotDuration] = useState<SlotDuration>(30);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [patientTypeFilter, setPatientTypeFilter] = useState<string>('');

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

  // Check scheduling access on component mount
  useEffect(() => {
    checkSchedulingAccess();
  }, []);

  // Fetch consultations when access is confirmed and date changes
  useEffect(() => {
    if (schedulingAccess.hasAccess && selectedDate) {
      fetchConsultations();
    }
  }, [schedulingAccess.hasAccess, selectedDate]);

  const checkSchedulingAccess = async () => {
    try {
      setIsCheckingAccess(true);
      setAccessError('');

      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      console.log('🔍 Checking scheduling access...');

      const response = await fetch(`${apiUrl}/api/professional/scheduling-access`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 Access check response status:', response.status);

      if (!response.ok) {
        if (response.status === 403) {
          // No access - this is expected for professionals without subscription
          setSchedulingAccess({
            hasAccess: false,
            expiresAt: null,
            reason: 'Acesso não autorizado'
          });
          return;
        }
        
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao verificar acesso');
      }

      const accessData = await response.json();
      console.log('✅ Access data received:', accessData);

      setSchedulingAccess(accessData);
    } catch (error) {
      console.error('❌ Error checking scheduling access:', error);
      setAccessError(error instanceof Error ? error.message : 'Erro ao verificar acesso à agenda');
      setSchedulingAccess({
        hasAccess: false,
        expiresAt: null,
        reason: null
      });
    } finally {
      setIsCheckingAccess(false);
    }
  };

  const fetchConsultations = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      console.log('🔄 Fetching consultations for date:', selectedDate);

      const response = await fetch(`${apiUrl}/api/consultations/agenda?date=${selectedDate}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 Consultations response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao carregar consultas');
      }

      const data = await response.json();
      console.log('✅ Consultations loaded:', data.length);
      setConsultations(data);
    } catch (error) {
      console.error('❌ Error fetching consultations:', error);
      setError(error instanceof Error ? error.message : 'Erro ao carregar consultas');
      setConsultations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSlotClick = (time: string) => {
    // Check if slot is available (no consultation at this time)
    const existingConsultation = consultations.find(consultation => {
      const consultationTime = new Date(consultation.date).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      return consultationTime === time;
    });

    if (existingConsultation) {
      // Open edit modal for existing consultation
      setSelectedConsultation(existingConsultation);
      setShowEditModal(true);
    } else {
      // Open quick schedule modal for empty slot
      setSelectedSlot({ date: selectedDate, time });
      setShowQuickSchedule(true);
    }
  };

  const handleEditConsultation = (consultation: Consultation) => {
    setSelectedConsultation(consultation);
    setShowEditModal(true);
  };

  const handleCancelConsultation = (consultation: Consultation) => {
    setSelectedConsultation(consultation);
    setShowCancelModal(true);
  };

  const handleCancelConfirm = async (reason?: string) => {
    if (!selectedConsultation) return;

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      console.log('🔄 Cancelling consultation:', selectedConsultation.id);

      const response = await fetch(`${apiUrl}/api/consultations/${selectedConsultation.id}/cancel`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cancellation_reason: reason || null
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao cancelar consulta');
      }

      console.log('✅ Consultation cancelled successfully');
      setSuccess('Consulta cancelada com sucesso! O horário foi liberado.');
      
      // Refresh consultations
      await fetchConsultations();
      
      // Close modal
      setShowCancelModal(false);
      setSelectedConsultation(null);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('❌ Error cancelling consultation:', error);
      setError(error instanceof Error ? error.message : 'Erro ao cancelar consulta');
    }
  };

  const handleModalSuccess = () => {
    fetchConsultations();
    setShowQuickSchedule(false);
    setShowEditModal(false);
    setShowRecurringModal(false);
    setSelectedSlot(null);
    setSelectedConsultation(null);
    setSuccess('Operação realizada com sucesso!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const generateTimeSlots = () => {
    return getValidTimeSlots(slotDuration, 7, 18); // 7 AM to 6 PM
  };

  const getConsultationAtTime = (time: string) => {
    return consultations.find(consultation => {
      const consultationTime = new Date(consultation.date).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      return consultationTime === time;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'confirmed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'completed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPatientTypeIcon = (consultation: Consultation) => {
    if (consultation.patient_type === 'private') {
      return <User className="h-4 w-4 text-purple-600" />;
    } else if (consultation.is_dependent) {
      return <Users className="h-4 w-4 text-blue-600" />;
    } else {
      return <User className="h-4 w-4 text-green-600" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate);
    if (direction === 'prev') {
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    setSelectedDate(currentDate.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  // Filter consultations based on filters
  const filteredConsultations = consultations.filter(consultation => {
    if (statusFilter && consultation.status !== statusFilter) return false;
    if (patientTypeFilter && consultation.patient_type !== patientTypeFilter) return false;
    return true;
  });

  // Show loading while checking access
  if (isCheckingAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Verificando acesso à agenda...</p>
          <p className="text-sm text-gray-500 mt-2">Aguarde um momento</p>
        </div>
      </div>
    );
  }

  // Show error if access check failed
  if (accessError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Erro de Conexão</h2>
            <p className="text-gray-600 mb-6">{accessError}</p>
            <button
              onClick={checkSchedulingAccess}
              className="btn btn-primary flex items-center mx-auto"
            >
              <RefreshCw className="h-5 w-5 mr-2" />
              Tentar Novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show payment screen if no access
  if (!schedulingAccess.hasAccess) {
    return (
      <SchedulingAccessPayment 
        professionalName={user?.name || 'Profissional'}
        onPaymentSuccess={checkSchedulingAccess}
      />
    );
  }

  // Main agenda interface
  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600">Gerencie seus agendamentos e consultas</p>
          
          {/* Access status banner */}
          {schedulingAccess.expiresAt && (
            <div className="mt-2 inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
              <CheckCircle className="h-4 w-4 mr-2" />
              Acesso ativo até {new Date(schedulingAccess.expiresAt).toLocaleDateString('pt-BR')}
            </div>
          )}
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setShowCancelledModal(true)}
            className="btn btn-outline flex items-center"
          >
            <XCircle className="h-5 w-5 mr-2" />
            Cancelamentos
          </button>
          
          <button
            onClick={() => setShowSlotCustomization(true)}
            className="btn btn-secondary flex items-center"
          >
            <Settings className="h-5 w-5 mr-2" />
            Configurar Slots
          </button>
          
          <button
            onClick={() => setShowRecurringModal(true)}
            className="btn btn-outline flex items-center"
          >
            <Repeat className="h-5 w-5 mr-2" />
            Consultas Recorrentes
          </button>
          
          <button
            onClick={() => setShowQuickSchedule(true)}
            className="btn btn-primary flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nova Consulta
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 flex items-center">
          <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-6 flex items-center">
          <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Date Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigateDate('prev')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
            
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900">
                {formatDate(selectedDate)}
              </h2>
              <p className="text-sm text-gray-500">
                {consultations.length} consulta{consultations.length !== 1 ? 's' : ''} agendada{consultations.length !== 1 ? 's' : ''}
              </p>
            </div>
            
            <button
              onClick={() => navigateDate('next')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="h-5 w-5 text-gray-600" />
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input w-auto"
            />
            
            <button
              onClick={goToToday}
              className="btn btn-secondary"
            >
              Hoje
            </button>
            
            <button
              onClick={fetchConsultations}
              className={`btn btn-outline flex items-center ${
                isLoading ? 'opacity-70 cursor-not-allowed' : ''
              }`}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filtros:</span>
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="">Todos os status</option>
            <option value="scheduled">Agendado</option>
            <option value="confirmed">Confirmado</option>
            <option value="completed">Concluído</option>
          </select>
          
          <select
            value={patientTypeFilter}
            onChange={(e) => setPatientTypeFilter(e.target.value)}
            className="input w-auto"
          >
            <option value="">Todos os tipos</option>
            <option value="convenio">Convênio</option>
            <option value="private">Particular</option>
          </select>
          
          {(statusFilter || patientTypeFilter) && (
            <button
              onClick={() => {
                setStatusFilter('');
                setPatientTypeFilter('');
              }}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Time Slots Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Clock className="h-6 w-6 text-red-600 mr-2" />
            <h2 className="text-xl font-semibold">Horários do Dia</h2>
          </div>
          
          <div className="text-sm text-gray-600">
            Slots de {slotDuration} minutos
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando agenda...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {generateTimeSlots().map((time) => {
              const consultation = getConsultationAtTime(time);
              const isFiltered = consultation && (
                (statusFilter && consultation.status !== statusFilter) ||
                (patientTypeFilter && consultation.patient_type !== patientTypeFilter)
              );

              if (isFiltered) return null;

              return (
                <div
                  key={time}
                  onClick={() => handleSlotClick(time)}
                  className={`
                    p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 hover:shadow-md
                    ${consultation 
                      ? `${getStatusColor(consultation.status)} hover:scale-105`
                      : 'border-gray-200 hover:border-red-300 hover:bg-red-50'
                    }
                  `}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{time}</span>
                    {consultation && getPatientTypeIcon(consultation)}
                  </div>

                  {consultation ? (
                    <div className="space-y-1">
                      <p className="font-medium text-gray-900 truncate">
                        {consultation.client_name}
                      </p>
                      <p className="text-sm text-gray-600 truncate">
                        {consultation.service_name}
                      </p>
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(consultation.value)}
                      </p>
                      {consultation.location_name && (
                        <div className="flex items-center text-xs text-gray-500">
                          <MapPin className="h-3 w-3 mr-1" />
                          {consultation.location_name}
                        </div>
                      )}
                      
                      {/* Action buttons */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-200">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(consultation.status)}`}>
                          {consultation.status === 'scheduled' && 'Agendado'}
                          {consultation.status === 'confirmed' && 'Confirmado'}
                          {consultation.status === 'completed' && 'Concluído'}
                          {consultation.status === 'cancelled' && 'Cancelado'}
                        </span>
                        
                        <div className="flex space-x-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditConsultation(consultation);
                            }}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Editar"
                          >
                            <Edit className="h-3 w-3" />
                          </button>
                          
                          {consultation.status !== 'cancelled' && consultation.status !== 'completed' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelConsultation(consultation);
                              }}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Cancelar"
                            >
                              <XCircle className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <Plus className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Horário livre</p>
                      <p className="text-xs text-gray-400">Clique para agendar</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Summary */}
        {consultations.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {consultations.filter(c => c.status === 'scheduled').length}
                </div>
                <div className="text-sm text-blue-700">Agendadas</div>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {consultations.filter(c => c.status === 'confirmed').length}
                </div>
                <div className="text-sm text-green-700">Confirmadas</div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-gray-600">
                  {consultations.filter(c => c.status === 'completed').length}
                </div>
                <div className="text-sm text-gray-700">Concluídas</div>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {formatCurrency(consultations.reduce((sum, c) => sum + c.value, 0))}
                </div>
                <div className="text-sm text-purple-700">Total do Dia</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <QuickScheduleModal
        isOpen={showQuickSchedule}
        onClose={() => {
          setShowQuickSchedule(false);
          setSelectedSlot(null);
        }}
        onSuccess={handleModalSuccess}
        selectedSlot={selectedSlot}
      />

      <EditConsultationModal
        isOpen={showEditModal}
        consultation={selectedConsultation}
        onClose={() => {
          setShowEditModal(false);
          setSelectedConsultation(null);
        }}
        onSuccess={handleModalSuccess}
      />

      <CancelConsultationModal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setSelectedConsultation(null);
        }}
        onConfirm={handleCancelConfirm}
        consultationData={selectedConsultation ? {
          id: selectedConsultation.id,
          patient_name: selectedConsultation.client_name,
          service_name: selectedConsultation.service_name,
          date: selectedConsultation.date,
          is_dependent: selectedConsultation.is_dependent,
          patient_type: selectedConsultation.patient_type,
          location_name: selectedConsultation.location_name
        } : null}
      />

      <RecurringConsultationModal
        isOpen={showRecurringModal}
        onClose={() => setShowRecurringModal(false)}
        onSuccess={handleModalSuccess}
      />

      <SlotCustomizationModal
        isOpen={showSlotCustomization}
        currentSlotDuration={slotDuration}
        onClose={() => setShowSlotCustomization(false)}
        onSlotDurationChange={(duration) => {
          setSlotDuration(duration);
          setShowSlotCustomization(false);
        }}
      />

      <CancelledConsultationsModal
        isOpen={showCancelledModal}
        onClose={() => setShowCancelledModal(false)}
        autoRefresh={success.includes('cancelada')}
      />
    </div>
  );
};

export default SchedulingPage;