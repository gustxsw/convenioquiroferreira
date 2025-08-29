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
  X,
  Check,
  AlertCircle,
  Repeat,
  Settings,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import EditConsultationModal from '../../components/EditConsultationModal';
import RecurringConsultationModal from '../../components/RecurringConsultationModal';

type Consultation = {
  id: number;
  date: string;
  client_name: string;
  service_name: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
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

type TimeSlot = {
  time: string;
  isAvailable: boolean;
  consultation?: Consultation;
};

const SchedulingPage: React.FC = () => {
  const { user } = useAuth();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [attendanceLocations, setAttendanceLocations] = useState<AttendanceLocation[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSlotDuration, setSelectedSlotDuration] = useState<15 | 30 | 60>(30);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [consultationToDelete, setConsultationToDelete] = useState<Consultation | null>(null);

  // Create consultation form state
  const [formData, setFormData] = useState({
    patient_type: 'convenio' as 'convenio' | 'private',
    client_cpf: '',
    private_patient_id: '',
    service_id: '',
    value: '',
    location_id: '',
    time: '',
    notes: '',
  });

  // Client search state
  const [clientSearchResult, setClientSearchResult] = useState<any>(null);
  const [dependents, setDependents] = useState<any[]>([]);
  const [selectedDependentId, setSelectedDependentId] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [patientTypeFilter, setPatientTypeFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  // Settings panel
  const [showSettings, setShowSettings] = useState(false);

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
    generateTimeSlots();
  }, [selectedDate, selectedSlotDuration, consultations]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      // Fetch consultations
      const consultationsResponse = await fetch(`${apiUrl}/api/consultations`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (consultationsResponse.ok) {
        const consultationsData = await consultationsResponse.json();
        setConsultations(consultationsData);
      }

      // Fetch services
      const servicesResponse = await fetch(`${apiUrl}/api/services`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (servicesResponse.ok) {
        const servicesData = await servicesResponse.json();
        setServices(servicesData);
      }

      // Fetch private patients
      const patientsResponse = await fetch(`${apiUrl}/api/private-patients`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (patientsResponse.ok) {
        const patientsData = await patientsResponse.json();
        setPrivatePatients(Array.isArray(patientsData) ? patientsData : []);
      }

      // Fetch attendance locations
      const locationsResponse = await fetch(`${apiUrl}/api/attendance-locations`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        setAttendanceLocations(locationsData);

        // Set default location
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
      setError('Não foi possível carregar os dados');
    } finally {
      setIsLoading(false);
    }
  };

  const generateTimeSlots = () => {
    const slots: TimeSlot[] = [];
    const startHour = 8; // 8:00 AM
    const endHour = 18; // 6:00 PM
    
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += selectedSlotDuration) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        
        // Check if this slot has a consultation
        const consultation = consultations.find(c => {
          const consultationDate = new Date(c.date);
          const consultationDateStr = consultationDate.toISOString().split('T')[0];
          const consultationTime = consultationDate.toTimeString().slice(0, 5);
          
          return consultationDateStr === selectedDate && consultationTime === timeString;
        });

        slots.push({
          time: timeString,
          isAvailable: !consultation,
          consultation: consultation
        });
      }
    }

    setTimeSlots(slots);
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
          headers: { Authorization: `Bearer ${token}` },
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
            headers: { Authorization: `Bearer ${token}` },
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
            headers: { Authorization: `Bearer ${token}` },
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

  const handleTimeSlotClick = (slot: TimeSlot) => {
    if (!slot.isAvailable) {
      // Edit existing consultation
      if (slot.consultation) {
        setSelectedConsultation(slot.consultation);
        setShowEditModal(true);
      }
    } else {
      // Create new consultation at this time
      setFormData(prev => ({ ...prev, time: slot.time }));
      setShowCreateModal(true);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      // Create date in Brasília timezone and convert to UTC
      const brasiliaOffset = -3 * 60; // -3 hours in minutes
      const localDate = new Date(`${selectedDate}T${formData.time}`);
      const utcDate = new Date(localDate.getTime() - (brasiliaOffset * 60 * 1000));

      // Prepare consultation data
      const consultationData: any = {
        service_id: parseInt(formData.service_id),
        location_id: formData.location_id ? parseInt(formData.location_id) : null,
        value: parseFloat(formData.value),
        date: utcDate.toISOString(),
        notes: formData.notes && formData.notes.trim() ? formData.notes.trim() : null,
      };

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
          Authorization: `Bearer ${token}`,
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
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao criar consulta');
    }
  };

  const resetForm = () => {
    setFormData({
      patient_type: 'convenio',
      client_cpf: '',
      private_patient_id: '',
      service_id: '',
      value: '',
      location_id: attendanceLocations.find(l => l.is_default)?.id.toString() || '',
      time: '',
      notes: '',
    });
    setClientSearchResult(null);
    setDependents([]);
    setSelectedDependentId(null);
  };

  const confirmDelete = (consultation: Consultation) => {
    setConsultationToDelete(consultation);
    setShowDeleteConfirm(true);
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

      setSuccess('Consulta excluída com sucesso!');
      await fetchData();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao excluir consulta');
    } finally {
      setConsultationToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  const formatCpf = (value: string) => {
    if (!value) return '';
    const numericValue = value.replace(/\D/g, '');
    return numericValue.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };


  const formatTime = (time: string) => {
    return time;
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'scheduled':
        return { text: 'Agendado', className: 'bg-blue-100 text-blue-800' };
      case 'confirmed':
        return { text: 'Confirmado', className: 'bg-green-100 text-green-800' };
      case 'completed':
        return { text: 'Concluído', className: 'bg-gray-100 text-gray-800' };
      case 'cancelled':
        return { text: 'Cancelado', className: 'bg-red-100 text-red-800' };
      default:
        return { text: 'Desconhecido', className: 'bg-gray-100 text-gray-800' };
    }
  };

  const getSlotDurationText = (duration: number) => {
    if (duration === 60) return '1 hora';
    return `${duration} min`;
  };

  // Filter consultations for the selected date
  const dayConsultations = consultations.filter(c => {
    const consultationDate = new Date(c.date);
    const consultationDateStr = consultationDate.toISOString().split('T')[0];
    return consultationDateStr === selectedDate;
  });

  const filteredConsultations = dayConsultations.filter(consultation => {
    const matchesStatus = !statusFilter || consultation.status === statusFilter;
    const matchesPatientType = !patientTypeFilter || consultation.patient_type === patientTypeFilter;
    const matchesSearch = !searchTerm || 
      consultation.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      consultation.service_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesPatientType && matchesSearch;
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600">Gerencie seus agendamentos e horários disponíveis</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn btn-outline flex items-center"
          >
            <Settings className="h-5 w-5 mr-2" />
            Configurações
            {showSettings ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
          </button>

          <button
            onClick={() => setShowRecurringModal(true)}
            className="btn btn-outline flex items-center"
          >
            <Repeat className="h-5 w-5 mr-2" />
            Consultas Recorrentes
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nova Consulta
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center mb-4">
            <Settings className="h-5 w-5 text-red-600 mr-2" />
            <h2 className="text-lg font-semibold">Configurações da Agenda</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duração dos Slots de Tempo
              </label>
              <div className="space-y-2">
                {[15, 30, 60].map((duration) => (
                  <label key={duration} className="flex items-center">
                    <input
                      type="radio"
                      name="slotDuration"
                      value={duration}
                      checked={selectedSlotDuration === duration}
                      onChange={(e) => setSelectedSlotDuration(Number(e.target.value) as 15 | 30 | 60)}
                      className="rounded border-gray-300 text-red-600 shadow-sm focus:border-red-300 focus:ring focus:ring-red-200 focus:ring-opacity-50"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {getSlotDurationText(duration)}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Define o intervalo entre os horários disponíveis na agenda
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Horário de Funcionamento
              </label>
              <div className="space-y-2 text-sm text-gray-600">
                <p>Início: 08:00</p>
                <p>Fim: 18:00</p>
                <p className="text-xs text-gray-500">
                  Horários fixos de segunda a sexta
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Informações
              </label>
              <div className="space-y-1 text-sm text-gray-600">
                <p>• Slots verdes: Disponíveis</p>
                <p>• Slots azuis: Agendados</p>
                <p>• Slots vermelhos: Cancelados</p>
                <p>• Clique para agendar ou editar</p>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Date Selection and Time Slots */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Date Selector */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center mb-4">
            <Calendar className="h-5 w-5 text-red-600 mr-2" />
            <h2 className="text-lg font-semibold">Selecionar Data</h2>
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="input w-full"
            min={new Date().toISOString().split('T')[0]}
          />

          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">
              <strong>Data selecionada:</strong> {new Date(selectedDate).toLocaleDateString('pt-BR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
            <p className="text-sm text-gray-600">
              <strong>Slots de:</strong> {getSlotDurationText(selectedSlotDuration)}
            </p>
          </div>
        </div>

        {/* Time Slots Grid */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Clock className="h-5 w-5 text-red-600 mr-2" />
              <h2 className="text-lg font-semibold">Horários Disponíveis</h2>
            </div>
            <div className="text-sm text-gray-500">
              Slots de {getSlotDurationText(selectedSlotDuration)}
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Carregando horários...</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {timeSlots.map((slot) => (
                <button
                  key={slot.time}
                  onClick={() => handleTimeSlotClick(slot)}
                  className={`
                    p-3 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105
                    ${slot.isAvailable
                      ? 'bg-green-100 text-green-800 hover:bg-green-200 border border-green-200'
                      : slot.consultation?.status === 'cancelled'
                      ? 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-200'
                      : 'bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-200'
                    }
                  `}
                  title={
                    slot.isAvailable
                      ? `Horário disponível - ${slot.time}`
                      : `${slot.consultation?.client_name} - ${slot.consultation?.service_name}`
                  }
                >
                  <div className="text-center">
                    <div className="font-medium">{formatTime(slot.time)}</div>
                    {!slot.isAvailable && slot.consultation && (
                      <div className="text-xs mt-1 truncate">
                        {slot.consultation.client_name}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Legend */}
          <div className="mt-6 flex flex-wrap gap-4 text-xs">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-100 border border-green-200 rounded mr-2"></div>
              <span className="text-gray-600">Disponível</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-100 border border-blue-200 rounded mr-2"></div>
              <span className="text-gray-600">Agendado</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-red-100 border border-red-200 rounded mr-2"></div>
              <span className="text-gray-600">Cancelado</span>
            </div>
          </div>
        </div>
      </div>

      {/* Consultations List for Selected Date */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Calendar className="h-5 w-5 text-red-600 mr-2" />
            <h2 className="text-lg font-semibold">
              Consultas do Dia ({new Date(selectedDate).toLocaleDateString('pt-BR')})
            </h2>
          </div>

          {dayConsultations.length > 0 && (
            <div className="text-sm text-gray-500">
              {dayConsultations.length} consulta(s) agendada(s)
            </div>
          )}
        </div>

        {/* Filters */}
        {dayConsultations.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar paciente ou serviço..."
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
              onClick={() => {
                setStatusFilter('');
                setPatientTypeFilter('');
                setSearchTerm('');
              }}
              className="btn btn-secondary"
            >
              Limpar Filtros
            </button>
          </div>
        )}

        {filteredConsultations.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {dayConsultations.length === 0 
                ? 'Nenhuma consulta agendada para este dia'
                : 'Nenhuma consulta encontrada com os filtros aplicados'
              }
            </h3>
            <p className="text-gray-600 mb-4">
              {dayConsultations.length === 0
                ? 'Clique em um horário disponível acima para agendar uma consulta.'
                : 'Tente ajustar os filtros ou limpar a busca.'
              }
            </p>
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
                  const consultationTime = new Date(consultation.date).toTimeString().slice(0, 5);
                  
                  return (
                    <tr key={consultation.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">
                            {formatTime(consultationTime)}
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
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{consultation.service_name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusInfo.className}`}>
                          {statusInfo.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600">
                          {consultation.location_name || 'Não informado'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => {
                              setSelectedConsultation(consultation);
                              setShowEditModal(true);
                            }}
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

      {/* Create consultation modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Nova Consulta</h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

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
                    <option value="convenio">Cliente do Convênio</option>
                    <option value="private">Paciente Particular</option>
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
                        {service.name} - R$ {service.base_price.toFixed(2)}
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

                {/* Time Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Horário *
                  </label>
                  <input
                    type="time"
                    value={formData.time}
                    onChange={(e) =>
                      setFormData(prev => ({ ...prev, time: e.target.value }))
                    }
                    className="input"
                    required
                  />
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
                  onClick={() => {
                    setShowCreateModal(false);
                    resetForm();
                  }}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Agendar Consulta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <EditConsultationModal
        isOpen={showEditModal}
        consultation={selectedConsultation}
        onClose={() => {
          setShowEditModal(false);
          setSelectedConsultation(null);
        }}
        onSuccess={() => {
          fetchData();
          setSuccess('Consulta atualizada com sucesso!');
        }}
      />

      {/* Recurring Modal */}
      <RecurringConsultationModal
        isOpen={showRecurringModal}
        onClose={() => setShowRecurringModal(false)}
        onSuccess={() => {
          fetchData();
          setSuccess('Consultas recorrentes criadas com sucesso!');
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
                onClick={() => {
                  setConsultationToDelete(null);
                  setShowDeleteConfirm(false);
                }}
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