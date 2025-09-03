import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  Calendar,
  Clock,
  Plus,
  Search,
  Filter,
  User,
  Users,
  MapPin,
  Edit,
  Trash2,
  Settings,
  Repeat,
  XCircle,
  AlertCircle,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import TimeInput from '../../components/TimeInput';
import SlotCustomizationModal from '../../components/SlotCustomizationModal';
import EditConsultationModal from '../../components/EditConsultationModal';
import CancelConsultationModal from '../../components/CancelConsultationModal';
import RecurringConsultationModal from '../../components/RecurringConsultationModal';
import CancelledConsultationsModal from '../../components/CancelledConsultationsModal';
import { validateTimeSlot, type SlotDuration } from '../../utils/timeSlotValidation';

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
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [filteredConsultations, setFilteredConsultations] = useState<Consultation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [attendanceLocations, setAttendanceLocations] = useState<AttendanceLocation[]>([]);
  
  // Date and time state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [slotDuration, setSlotDuration] = useState<SlotDuration>(30);
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('today');
  
  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [showCancelledModal, setShowCancelledModal] = useState(false);
  
  // Selected consultation for modals
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  
  // Create consultation form state
  const [formData, setFormData] = useState({
    patient_type: 'private' as 'convenio' | 'private',
    client_cpf: '',
    private_patient_id: '',
    service_id: '',
    value: '',
    location_id: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00', // Default time
    notes: '',
  });
  
  // Client search state
  const [clientSearchResult, setClientSearchResult] = useState<any>(null);
  const [dependents, setDependents] = useState<any[]>([]);
  const [selectedDependentId, setSelectedDependentId] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

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
    applyFilters();
  }, [consultations, searchTerm, statusFilter, dateFilter, selectedDate]);

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
      setError('Não foi possível carregar os dados');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = consultations;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(consultation =>
        consultation.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        consultation.service_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by status
    if (statusFilter) {
      filtered = filtered.filter(consultation => consultation.status === statusFilter);
    }

    // Filter by date
    if (dateFilter === 'today') {
      const today = new Date().toISOString().split('T')[0];
      filtered = filtered.filter(consultation => 
        consultation.date.split('T')[0] === today
      );
    } else if (dateFilter === 'week') {
      const today = new Date();
      const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(consultation => {
        const consultationDate = new Date(consultation.date);
        return consultationDate >= today && consultationDate <= weekFromNow;
      });
    } else if (dateFilter === 'selected') {
      filtered = filtered.filter(consultation => 
        consultation.date.split('T')[0] === selectedDate
      );
    }

    setFilteredConsultations(filtered);
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

  const handleTimeChange = (time: string) => {
    setFormData(prev => ({ ...prev, time }));
  };

  const validateForm = (): boolean => {
    // Validate required fields
    if (!formData.service_id) {
      setError('Selecione um serviço');
      return false;
    }

    if (!formData.value || parseFloat(formData.value) <= 0) {
      setError('Valor deve ser maior que zero');
      return false;
    }

    if (!formData.date) {
      setError('Selecione uma data');
      return false;
    }

    if (!formData.time) {
      setError('Digite um horário');
      return false;
    }

    // Validate time format and slot
    const timeValidation = validateTimeSlot(formData.time, slotDuration);
    if (!timeValidation.isValid) {
      setError(timeValidation.error || 'Horário inválido');
      return false;
    }

    // Validate patient selection
    if (formData.patient_type === 'convenio') {
      if (!clientSearchResult) {
        setError('Busque e selecione um cliente do convênio');
        return false;
      }
    } else {
      if (!formData.private_patient_id) {
        setError('Selecione um paciente particular');
        return false;
      }
    }

    return true;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setIsCreating(true);
      setError('');

      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      // Create date in Brasília timezone and convert to UTC
      const brasiliaOffset = -3 * 60; // -3 hours in minutes
      const localDate = new Date(`${formData.date}T${formData.time}`);
      const utcDate = new Date(localDate.getTime() - (brasiliaOffset * 60 * 1000));

      const consultationData: any = {
        service_id: parseInt(formData.service_id),
        location_id: formData.location_id ? parseInt(formData.location_id) : null,
        value: parseFloat(formData.value),
        date: utcDate.toISOString(),
        notes: formData.notes && formData.notes.trim() ? formData.notes.trim() : null,
        timezone_offset: -3 // Brasília timezone offset
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
      
      // Reset form
      setFormData({
        patient_type: 'private',
        client_cpf: '',
        private_patient_id: '',
        service_id: '',
        value: '',
        location_id: attendanceLocations.find(l => l.is_default)?.id.toString() || '',
        date: new Date().toISOString().split('T')[0],
        time: '09:00',
        notes: '',
      });
      setClientSearchResult(null);
      setDependents([]);
      setSelectedDependentId(null);
      setShowCreateModal(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao criar consulta');
    } finally {
      setIsCreating(false);
    }
  };

  const openEditModal = (consultation: Consultation) => {
    setSelectedConsultation(consultation);
    setShowEditModal(true);
  };

  const openCancelModal = (consultation: Consultation) => {
    setSelectedConsultation(consultation);
    setShowCancelModal(true);
  };

  const handleCancelConsultation = async (reason?: string) => {
    if (!selectedConsultation) return;

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/api/consultations/${selectedConsultation.id}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cancellation_reason: reason || null
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao cancelar consulta');
      }

      setSuccess('Consulta cancelada com sucesso!');
      await fetchData();
      setShowCancelModal(false);
      setSelectedConsultation(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao cancelar consulta');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatCpf = (value: string) => {
    if (!value) return '';
    const numericValue = value.replace(/\D/g, '');
    return numericValue.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const getStatusDisplay = (status: string) => {
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

  const getPatientTypeDisplay = (consultation: Consultation) => {
    if (consultation.patient_type === 'private') {
      return {
        icon: <User className="h-4 w-4 text-purple-600" />,
        label: 'Particular',
        className: 'bg-purple-100 text-purple-800'
      };
    } else if (consultation.is_dependent) {
      return {
        icon: <Users className="h-4 w-4 text-blue-600" />,
        label: 'Dependente',
        className: 'bg-blue-100 text-blue-800'
      };
    } else {
      return {
        icon: <User className="h-4 w-4 text-green-600" />,
        label: 'Titular',
        className: 'bg-green-100 text-green-800'
      };
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
    setDateFilter('today');
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  // Statistics
  const todayConsultations = consultations.filter(c => 
    c.date.split('T')[0] === new Date().toISOString().split('T')[0]
  ).length;

  const scheduledCount = consultations.filter(c => c.status === 'scheduled').length;
  const confirmedCount = consultations.filter(c => c.status === 'confirmed').length;
  const completedCount = consultations.filter(c => c.status === 'completed').length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda de Consultas</h1>
          <p className="text-gray-600">Gerencie seus agendamentos e consultas</p>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setShowSlotModal(true)}
            className="btn btn-outline flex items-center"
          >
            <Settings className="h-5 w-5 mr-2" />
            Configurar Slots
          </button>

          <button
            onClick={() => setShowRecurringModal(true)}
            className="btn btn-secondary flex items-center"
          >
            <Repeat className="h-5 w-5 mr-2" />
            Consultas Recorrentes
          </button>

          <button
            onClick={() => setShowCancelledModal(true)}
            className="btn btn-outline flex items-center"
          >
            <XCircle className="h-5 w-5 mr-2" />
            Canceladas
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

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{todayConsultations}</div>
            <div className="text-sm text-gray-600">Hoje</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{scheduledCount}</div>
            <div className="text-sm text-gray-600">Agendadas</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{confirmedCount}</div>
            <div className="text-sm text-gray-600">Confirmadas</div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">{completedCount}</div>
            <div className="text-sm text-gray-600">Concluídas</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center mb-4">
          <Filter className="h-5 w-5 text-red-600 mr-2" />
          <h2 className="text-lg font-semibold">Filtros</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="input"
          >
            <option value="">Todas as datas</option>
            <option value="today">Hoje</option>
            <option value="week">Próximos 7 dias</option>
            <option value="selected">Data específica</option>
          </select>

          {dateFilter === 'selected' && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="input"
            />
          )}

          <button
            onClick={resetFilters}
            className="btn btn-secondary"
          >
            Limpar Filtros
          </button>
        </div>

        {/* Current slot configuration display */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Clock className="h-4 w-4" />
              <span>Configuração atual: slots de {slotDuration} minutos</span>
            </div>
            <button
              onClick={() => setShowSlotModal(true)}
              className="text-red-600 hover:text-red-700 text-sm font-medium"
            >
              Alterar configuração
            </button>
          </div>
        </div>
      </div>

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

      {/* Consultations Table */}
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
              {searchTerm || statusFilter || dateFilter ? 'Nenhuma consulta encontrada' : 'Nenhuma consulta agendada'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || statusFilter || dateFilter
                ? 'Tente ajustar os filtros de busca.'
                : 'Comece agendando sua primeira consulta.'
              }
            </p>
            {!searchTerm && !statusFilter && !dateFilter && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary inline-flex items-center"
              >
                <Plus className="h-5 w-5 mr-2" />
                Agendar Primeira Consulta
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data/Hora
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
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredConsultations.map((consultation) => {
                  const statusInfo = getStatusDisplay(consultation.status);
                  const patientTypeInfo = getPatientTypeDisplay(consultation);
                  
                  return (
                    <tr key={consultation.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                          {formatDate(consultation.date)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {patientTypeInfo.icon}
                          <div className="ml-2">
                            <div className="text-sm font-medium text-gray-900">
                              {consultation.client_name}
                            </div>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${patientTypeInfo.className}`}>
                              {patientTypeInfo.label}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{consultation.service_name}</div>
                        {consultation.location_name && (
                          <div className="text-xs text-gray-500 flex items-center mt-1">
                            <MapPin className="h-3 w-3 mr-1" />
                            {consultation.location_name}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusInfo.className}`}>
                          {statusInfo.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(consultation.value)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openEditModal(consultation)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          {consultation.status !== 'cancelled' && (
                            <button
                              onClick={() => openCancelModal(consultation)}
                              className="text-red-600 hover:text-red-900"
                              title="Cancelar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
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

      {/* Create Consultation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Nova Consulta</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                  disabled={isCreating}
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

                {/* Date, Time and Value */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data *
                    </label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) =>
                        setFormData(prev => ({ ...prev, date: e.target.value }))
                      }
                      className="input"
                      required
                    />
                  </div>

                  <TimeInput
                    value={formData.time}
                    onChange={handleTimeChange}
                    slotDuration={slotDuration}
                    label="Horário"
                    required
                    showValidation
                    businessHours={{ start: 7, end: 18 }}
                  />

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
                </div>

                {/* Location and Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Observações
                    </label>
                    <input
                      type="text"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData(prev => ({ ...prev, notes: e.target.value }))
                      }
                      className="input"
                      placeholder="Observações sobre a consulta..."
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                  disabled={isCreating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`btn btn-primary ${
                    isCreating ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Agendando...
                    </>
                  ) : (
                    <>
                      <Calendar className="h-5 w-5 mr-2" />
                      Agendar Consulta
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slot Customization Modal */}
      <SlotCustomizationModal
        isOpen={showSlotModal}
        currentSlotDuration={slotDuration}
        onClose={() => setShowSlotModal(false)}
        onSlotDurationChange={setSlotDuration}
      />

      {/* Edit Consultation Modal */}
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

      {/* Cancel Consultation Modal */}
      <CancelConsultationModal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setSelectedConsultation(null);
        }}
        onConfirm={handleCancelConsultation}
        consultationData={selectedConsultation}
      />

      {/* Recurring Consultation Modal */}
      <RecurringConsultationModal
        isOpen={showRecurringModal}
        onClose={() => setShowRecurringModal(false)}
        onSuccess={() => {
          fetchData();
          setSuccess('Consultas recorrentes criadas com sucesso!');
        }}
      />

      {/* Cancelled Consultations Modal */}
      <CancelledConsultationsModal
        isOpen={showCancelledModal}
        onClose={() => setShowCancelledModal(false)}
      />
    </div>
  );
};

export default SchedulingPage;