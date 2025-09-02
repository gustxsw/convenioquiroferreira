import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { format, addDays, startOfWeek, isSameDay, parseISO, addMinutes, isBefore, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Calendar,
  Clock,
  Plus,
  ChevronLeft,
  ChevronRight,
  User,
  Users,
  MapPin,
  Edit,
  Trash2,
  X,
  Check,
  AlertCircle,
  Settings,
  Repeat,
  Eye,
  CreditCard,
  Gift,
  Lock
} from 'lucide-react';
import EditConsultationModal from '../../components/EditConsultationModal';
import SlotCustomizationModal from '../../components/SlotCustomizationModal';
import RecurringConsultationModal from '../../components/RecurringConsultationModal';

type SlotDuration = 15 | 30 | 60;

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

type Service = {
  id: number;
  name: string;
  base_price: number;
};

type AttendanceLocation = {
  id: number;
  name: string;
  address: string;
  is_default: boolean;
};

type PrivatePatient = {
  id: number;
  name: string;
  cpf: string;
};

const SchedulingPage: React.FC = () => {
  const { user } = useAuth();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [attendanceLocations, setAttendanceLocations] = useState<AttendanceLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hasSchedulingAccess, setHasSchedulingAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);

  // Form state for quick consultation creation
  const [formData, setFormData] = useState({
    patient_type: 'private' as 'convenio' | 'private',
    client_cpf: '',
    private_patient_id: '',
    service_id: '',
    value: '',
    location_id: '',
    notes: '',
  });

  // Client search state
  const [clientSearchResult, setClientSearchResult] = useState<any>(null);
  const [dependents, setDependents] = useState<any[]>([]);
  const [selectedDependentId, setSelectedDependentId] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [consultationToDelete, setConsultationToDelete] = useState<Consultation | null>(null);

  // Slot customization
  const [slotDuration, setSlotDuration] = useState<SlotDuration>(30);

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
    checkSchedulingAccess();
  }, []);

  useEffect(() => {
    if (hasSchedulingAccess) {
      fetchData();
    }
  }, [currentWeek, hasSchedulingAccess]);

  const checkSchedulingAccess = async () => {
    try {
      setIsCheckingAccess(true);
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      console.log('🔄 Checking scheduling access for professional:', user?.id);

      const response = await fetch(`${apiUrl}/api/professionals/${user?.id}/scheduling-access`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('📡 Scheduling access response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Scheduling access data:', data);
        setHasSchedulingAccess(data.has_access);
      } else {
        console.warn('⚠️ Scheduling access check failed:', response.status);
        setHasSchedulingAccess(false);
      }
    } catch (error) {
      console.error('❌ Error checking scheduling access:', error);
      setHasSchedulingAccess(false);
    } finally {
      setIsCheckingAccess(false);
    }
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      // Calculate week range
      const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 6);

      console.log('🔄 Fetching scheduling data for week:', {
        start: weekStart.toISOString(),
        end: weekEnd.toISOString()
      });

      // Fetch consultations for the week
      const consultationsResponse = await fetch(
        `${apiUrl}/api/consultations?start_date=${weekStart.toISOString().split('T')[0]}&end_date=${weekEnd.toISOString().split('T')[0]}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (consultationsResponse.ok) {
        const consultationsData = await consultationsResponse.json();
        console.log('✅ Consultations loaded:', consultationsData.length);
        setConsultations(consultationsData);
      } else {
        console.warn('⚠️ Consultations not available:', consultationsResponse.status);
        setConsultations([]);
      }

      // Fetch services
      const servicesResponse = await fetch(`${apiUrl}/api/services`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (servicesResponse.ok) {
        const servicesData = await servicesResponse.json();
        setServices(servicesData);
      }

      // Fetch private patients
      const patientsResponse = await fetch(`${apiUrl}/api/private-patients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (patientsResponse.ok) {
        const patientsData = await patientsResponse.json();
        setPrivatePatients(Array.isArray(patientsData) ? patientsData : []);
      }

      // Fetch attendance locations
      const locationsResponse = await fetch(`${apiUrl}/api/attendance-locations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        setAttendanceLocations(locationsData);

        // Set default location if exists
        const defaultLocation = locationsData.find((loc: AttendanceLocation) => loc.is_default);
        if (defaultLocation) {
          setFormData(prev => ({
            ...prev,
            location_id: defaultLocation.id.toString(),
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Não foi possível carregar os dados da agenda');
    } finally {
      setIsLoading(false);
    }
  };

  const searchClientByCpf = async () => {
    if (!formData.client_cpf) return;

    try {
      setIsSearching(true);
      setError('');

      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();
      const cleanCpf = formData.client_cpf.replace(/\D/g, '');

      // Search for client
      const clientResponse = await fetch(
        `${apiUrl}/api/clients/lookup?cpf=${cleanCpf}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      if (clientResponse.ok) {
        const clientData = await clientResponse.json();
        
        if (clientData.subscription_status !== 'active') {
          setError('Cliente não possui assinatura ativa');
          return;
        }

        setClientSearchResult(clientData);

        // Fetch dependents
        const dependentsResponse = await fetch(
          `${apiUrl}/api/dependents/${clientData.id}`,
          {
            headers: { 'Authorization': `Bearer ${token}` },
          }
        );

        if (dependentsResponse.ok) {
          const dependentsData = await dependentsResponse.json();
          setDependents(dependentsData.filter((d: any) => d.subscription_status === 'active'));
        }
      } else {
        // Try searching as dependent
        const dependentResponse = await fetch(
          `${apiUrl}/api/dependents/lookup?cpf=${cleanCpf}`,
          {
            headers: { 'Authorization': `Bearer ${token}` },
          }
        );

        if (dependentResponse.ok) {
          const dependentData = await dependentResponse.json();
          
          if (dependentData.dependent_subscription_status !== 'active') {
            setError('Dependente não possui assinatura ativa');
            return;
          }

          setClientSearchResult({
            id: dependentData.user_id,
            name: dependentData.client_name,
            subscription_status: 'active',
          });
          setSelectedDependentId(dependentData.id);
          setDependents([]);
        } else {
          setError('Cliente ou dependente não encontrado');
        }
      }
    } catch (error) {
      setError('Erro ao buscar cliente');
    } finally {
      setIsSearching(false);
    }
  };

  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const serviceId = e.target.value;
    setFormData(prev => ({ ...prev, service_id: serviceId }));

    // Auto-fill value based on service
    const service = services.find(s => s.id.toString() === serviceId);
    if (service) {
      setFormData(prev => ({
        ...prev,
        value: service.base_price.toString(),
      }));
    }
  };

  const openCreateModal = (date?: string, time?: string) => {
    setSelectedSlot(date && time ? { date, time } : null);
    setFormData({
      patient_type: 'private',
      client_cpf: '',
      private_patient_id: '',
      service_id: '',
      value: '',
      location_id: attendanceLocations.find(loc => loc.is_default)?.id.toString() || '',
      notes: '',
    });
    setClientSearchResult(null);
    setDependents([]);
    setSelectedDependentId(null);
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setSelectedSlot(null);
    setError('');
    setSuccess('');
  };

  const openEditModal = (consultation: Consultation) => {
    setSelectedConsultation(consultation);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setSelectedConsultation(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      // Prepare consultation data
      const consultationData: any = {
        service_id: parseInt(formData.service_id),
        location_id: formData.location_id ? parseInt(formData.location_id) : null,
        value: parseFloat(formData.value),
        notes: formData.notes && formData.notes.trim() ? formData.notes.trim() : null,
        timezone_offset: -3 // Brasília timezone offset
      };

      // Set date and time
      if (selectedSlot) {
        // Create date in Brasília timezone and convert to UTC
        const brasiliaOffset = -3 * 60; // -3 hours in minutes
        const localDate = new Date(`${selectedSlot.date}T${selectedSlot.time}`);
        const utcDate = new Date(localDate.getTime() - (brasiliaOffset * 60 * 1000));
        consultationData.date = utcDate.toISOString();
      } else {
        setError('Data e horário são obrigatórios');
        return;
      }

      // Set patient based on type
      if (formData.patient_type === 'private') {
        consultationData.private_patient_id = parseInt(formData.private_patient_id);
      } else {
        if (selectedDependentId) {
          consultationData.dependent_id = selectedDependentId;
        } else {
          consultationData.user_id = clientSearchResult?.id;
        }
      }

      const response = await fetch(`${apiUrl}/api/consultations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(consultationData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao criar consulta');
      }

      setSuccess('Consulta agendada com sucesso!');
      await fetchData();
      closeCreateModal();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao criar consulta');
    }
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
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao excluir consulta');
      }

      setSuccess('Consulta excluída com sucesso!');
      await fetchData();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao excluir consulta');
    } finally {
      setConsultationToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeek(prev => addDays(prev, direction === 'next' ? 7 : -7));
  };

  const generateTimeSlots = () => {
    const slots = [];
    const startHour = 8;
    const endHour = 18;
    
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += slotDuration) {
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(time);
      }
    }
    
    return slots;
  };

  const getWeekDays = () => {
    const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  };

  const getConsultationsForSlot = (date: Date, time: string) => {
    return consultations.filter(consultation => {
      const consultationDate = parseISO(consultation.date);
      const consultationTime = format(consultationDate, 'HH:mm');
      
      // Check if it's the same day and within the slot duration
      if (!isSameDay(consultationDate, date)) return false;
      
      const slotStart = new Date(`2000-01-01T${time}`);
      const slotEnd = addMinutes(slotStart, slotDuration);
      const consultationTimeDate = new Date(`2000-01-01T${consultationTime}`);
      
      return consultationTimeDate >= slotStart && consultationTimeDate < slotEnd;
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

  const formatCpf = (value: string) => {
    if (!value) return '';
    const numericValue = value.replace(/\D/g, '');
    return numericValue.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Show access denied screen if no scheduling access
  if (isCheckingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando acesso à agenda...</p>
        </div>
      </div>
    );
  }

  if (!hasSchedulingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="h-8 w-8 text-yellow-600" />
            </div>
            
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Acesso à Agenda Restrito
            </h1>
            
            <p className="text-gray-600 mb-6 leading-relaxed">
              Você não possui acesso ao sistema de agendamentos no momento. 
              Entre em contato com a administração para solicitar acesso.
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-medium text-blue-900 mb-2">O que está incluído no acesso:</h3>
              <ul className="text-sm text-blue-700 space-y-1 text-left">
                <li>• Sistema completo de agendamentos</li>
                <li>• Gestão de pacientes particulares</li>
                <li>• Prontuários médicos digitais</li>
                <li>• Geração de documentos médicos</li>
                <li>• Relatórios detalhados</li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-center text-sm text-gray-600">
                <Gift className="h-4 w-4 text-green-600 mr-2" />
                <span>Acesso gratuito disponível para novos profissionais</span>
              </div>
              
              <p className="text-sm text-gray-500">
                <strong>Contato:</strong> (64) 98124-9199
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const weekDays = getWeekDays();
  const timeSlots = generateTimeSlots();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600">Gerencie seus agendamentos e consultas</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowSlotModal(true)}
            className="btn btn-outline flex items-center"
            title="Personalizar duração dos slots"
          >
            <Settings className="h-5 w-5 mr-2" />
            Slots ({slotDuration}min)
          </button>

          <button
            onClick={() => setShowRecurringModal(true)}
            className="btn btn-secondary flex items-center"
          >
            <Repeat className="h-5 w-5 mr-2" />
            Consultas Recorrentes
          </button>

          <button
            onClick={() => openCreateModal()}
            className="btn btn-primary flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nova Consulta
          </button>
        </div>
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

      {/* Week Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigateWeek('prev')}
            className="btn btn-secondary flex items-center"
          >
            <ChevronLeft className="h-5 w-5 mr-1" />
            Anterior
          </button>

          <div className="text-center">
            <h2 className="text-lg font-semibold text-gray-900">
              {format(weekDays[0], "dd 'de' MMMM", { locale: ptBR })} - {format(weekDays[6], "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </h2>
            <p className="text-sm text-gray-600">
              Semana de {format(weekDays[0], 'dd/MM', { locale: ptBR })} a {format(weekDays[6], 'dd/MM', { locale: ptBR })}
            </p>
          </div>

          <button
            onClick={() => navigateWeek('next')}
            className="btn btn-secondary flex items-center"
          >
            Próxima
            <ChevronRight className="h-5 w-5 ml-1" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando agenda...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                    Horário
                  </th>
                  {weekDays.map((day) => (
                    <th key={day.toISOString()} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div>
                        <div className="font-semibold">
                          {format(day, 'EEEE', { locale: ptBR })}
                        </div>
                        <div className="text-lg font-bold text-gray-900">
                          {format(day, 'dd')}
                        </div>
                        <div className="text-xs">
                          {format(day, 'MMM', { locale: ptBR })}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {timeSlots.map((time) => (
                  <tr key={time} className="hover:bg-gray-50">
                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 bg-gray-50">
                      {time}
                    </td>
                    {weekDays.map((day) => {
                      const dayConsultations = getConsultationsForSlot(day, time);
                      const isToday = isSameDay(day, new Date());
                      const isPast = isBefore(day, new Date()) && !isToday;
                      
                      return (
                        <td key={`${day.toISOString()}-${time}`} className={`px-2 py-2 relative ${isToday ? 'bg-blue-50' : ''}`}>
                          {dayConsultations.length > 0 ? (
                            <div className="space-y-1">
                              {dayConsultations.map((consultation) => (
                                <div
                                  key={consultation.id}
                                  className={`p-2 rounded-lg border text-xs cursor-pointer hover:shadow-sm transition-all ${getStatusColor(consultation.status)}`}
                                  onClick={() => openEditModal(consultation)}
                                >
                                  <div className="flex items-center mb-1">
                                    {consultation.is_dependent ? (
                                      <Users className="h-3 w-3 mr-1" />
                                    ) : consultation.patient_type === 'private' ? (
                                      <User className="h-3 w-3 mr-1 text-purple-600" />
                                    ) : (
                                      <User className="h-3 w-3 mr-1" />
                                    )}
                                    <span className="font-medium truncate">
                                      {consultation.client_name}
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-600 truncate">
                                    {consultation.service_name}
                                  </div>
                                  <div className="text-xs font-medium">
                                    {formatCurrency(consultation.value)}
                                  </div>
                                  {consultation.location_name && (
                                    <div className="flex items-center text-xs text-gray-500 mt-1">
                                      <MapPin className="h-2 w-2 mr-1" />
                                      <span className="truncate">{consultation.location_name}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <button
                              onClick={() => openCreateModal(format(day, 'yyyy-MM-dd'), time)}
                              className={`w-full h-12 rounded-lg border-2 border-dashed transition-colors ${
                                isPast 
                                  ? 'border-gray-200 bg-gray-50 cursor-not-allowed' 
                                  : 'border-gray-300 hover:border-red-400 hover:bg-red-50'
                              }`}
                              disabled={isPast}
                              title={isPast ? 'Não é possível agendar no passado' : 'Clique para agendar'}
                            >
                              {!isPast && (
                                <Plus className="h-4 w-4 text-gray-400 mx-auto" />
                              )}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create consultation modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center">
                  <Calendar className="h-6 w-6 text-red-600 mr-2" />
                  Nova Consulta
                  {selectedSlot && (
                    <span className="ml-2 text-sm font-normal text-gray-600">
                      - {format(new Date(selectedSlot.date), 'dd/MM/yyyy')} às {selectedSlot.time}
                    </span>
                  )}
                </h2>
                <button
                  onClick={closeCreateModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-6 mt-4 bg-red-50 text-red-600 p-3 rounded-lg flex items-center">
                <AlertCircle className="h-5 w-5 mr-2" />
                {error}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="p-6">
              <div className="space-y-6">
                {/* Patient Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Paciente *
                  </label>
                  <select
                    value={formData.patient_type}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        patient_type: e.target.value as 'convenio' | 'private',
                        client_cpf: '',
                        private_patient_id: '',
                      }))
                    }
                    className="input"
                    required
                  >
                    <option value="private">Paciente Particular</option>
                    <option value="convenio">Cliente do Convênio</option>
                  </select>
                </div>

                {/* Private Patient Selection */}
                {formData.patient_type === 'private' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Paciente Particular *
                    </label>
                    <select
                      value={formData.private_patient_id}
                      onChange={(e) =>
                        setFormData(prev => ({
                          ...prev,
                          private_patient_id: e.target.value,
                        }))
                      }
                      className="input"
                      required
                    >
                      <option value="">Selecione um paciente</option>
                      {privatePatients.map((patient) => (
                        <option key={patient.id} value={patient.id}>
                          {patient.name} - {patient.cpf ? formatCpf(patient.cpf) : 'CPF não informado'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Convenio Client Search */}
                {formData.patient_type === 'convenio' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CPF do Cliente *
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={formatCpf(formData.client_cpf)}
                        onChange={(e) =>
                          setFormData(prev => ({
                            ...prev,
                            client_cpf: e.target.value.replace(/\D/g, ''),
                          }))
                        }
                        className="input flex-1"
                        placeholder="000.000.000-00"
                      />
                      <button
                        type="button"
                        onClick={searchClientByCpf}
                        className="btn btn-secondary"
                        disabled={isSearching}
                      >
                        {isSearching ? 'Buscando...' : 'Buscar'}
                      </button>
                    </div>

                    {/* Client Search Result */}
                    {clientSearchResult && (
                      <div className="mt-3 p-3 bg-green-50 rounded-lg">
                        <p className="font-medium text-green-800">
                          Cliente: {clientSearchResult.name}
                        </p>
                        
                        {/* Dependent Selection */}
                        {dependents.length > 0 && (
                          <div className="mt-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Dependente (opcional)
                            </label>
                            <select
                              value={selectedDependentId || ''}
                              onChange={(e) =>
                                setSelectedDependentId(e.target.value ? Number(e.target.value) : null)
                              }
                              className="input"
                            >
                              <option value="">Consulta para o titular</option>
                              {dependents.map((dependent) => (
                                <option key={dependent.id} value={dependent.id}>
                                  {dependent.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Service Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serviço *
                  </label>
                  <select
                    value={formData.service_id}
                    onChange={handleServiceChange}
                    className="input"
                    required
                  >
                    <option value="">Selecione um serviço</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} - {formatCurrency(service.base_price)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Value and Location */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valor (R$) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.value}
                      onChange={(e) =>
                        setFormData(prev => ({ ...prev, value: e.target.value }))
                      }
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Local de Atendimento
                    </label>
                    <select
                      value={formData.location_id}
                      onChange={(e) =>
                        setFormData(prev => ({ ...prev, location_id: e.target.value }))
                      }
                      className="input"
                    >
                      <option value="">Selecione um local</option>
                      {attendanceLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name} {location.is_default && '(Padrão)'}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observações
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData(prev => ({ ...prev, notes: e.target.value }))
                    }
                    className="input min-h-[80px]"
                    placeholder="Observações sobre a consulta..."
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex items-center"
                >
                  <Check className="h-5 w-5 mr-2" />
                  Agendar Consulta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Consultation Modal */}
      <EditConsultationModal
        isOpen={showEditModal}
        consultation={selectedConsultation}
        onClose={closeEditModal}
        onSuccess={() => {
          fetchData();
          closeEditModal();
        }}
      />

      {/* Slot Customization Modal */}
      <SlotCustomizationModal
        isOpen={showSlotModal}
        currentSlotDuration={slotDuration}
        onClose={() => setShowSlotModal(false)}
        onSlotDurationChange={(duration) => {
          setSlotDuration(duration);
          setShowSlotModal(false);
        }}
      />

      {/* Recurring Consultation Modal */}
      <RecurringConsultationModal
        isOpen={showRecurringModal}
        onClose={() => setShowRecurringModal(false)}
        onSuccess={() => {
          fetchData();
          setShowRecurringModal(false);
        }}
      />

      {/* Delete confirmation modal */}
      {showDeleteConfirm && consultationToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Confirmar Exclusão</h2>
            
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
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulingPage;