import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  Calendar,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  User,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  X,
  Check,
  MessageCircle,
  RefreshCw,
  CalendarDays,
  MapPin
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Appointment = {
  id: number;
  client_id: number | null;
  dependent_id: number | null;
  private_patient_id: number | null;
  client_name: string;
  client_phone: string | null;
  service_name: string;
  location_name: string | null;
  date: string;
  time: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  value: number;
  is_recurring: boolean;
  recurring_days: string[] | null;
  session_count: number | null;
  total_sessions: number | null;
  created_at: string;
};

type Service = {
  id: number;
  name: string;
  base_price: number;
  category_name: string;
};

type Client = {
  id: number;
  name: string;
  cpf: string;
  phone: string;
  subscription_status: string;
};

type Dependent = {
  id: number;
  name: string;
  cpf: string;
  client_id: number;
  client_name: string;
  client_phone: string;
  subscription_status: string;
};

type PrivatePatient = {
  id: number;
  name: string;
  cpf: string;
  phone: string;
};

type AttendanceLocation = {
  id: number;
  name: string;
  address: string;
  is_default: boolean;
};

const SchedulingPage: React.FC = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);

  // Form data
  const [services, setServices] = useState<Service[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [attendanceLocations, setAttendanceLocations] = useState<AttendanceLocation[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    patient_type: 'convenio' as 'convenio' | 'private',
    client_id: '',
    dependent_id: '',
    private_patient_id: '',
    service_id: '',
    location_id: '',
    date: '',
    time: '',
    value: '',
    is_recurring: false,
    recurring_days: [] as string[],
    total_sessions: ''
  });

  // Reschedule data
  const [rescheduleData, setRescheduleData] = useState({
    date: '',
    time: ''
  });
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null);

  // Private patient search state
  const [privatePatientSearch, setPrivatePatientSearch] = useState('');
  const [filteredPrivatePatients, setFilteredPrivatePatients] = useState<PrivatePatient[]>([]);

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
    let filtered = appointments;

    if (searchTerm) {
      filtered = filtered.filter(apt =>
        apt.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        apt.service_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter) {
      filtered = filtered.filter(apt => apt.status === statusFilter);
    }

    setFilteredAppointments(filtered);
  }, [appointments, searchTerm, statusFilter]);

  // Filter private patients based on search
  useEffect(() => {
    if (privatePatientSearch.trim()) {
      const filtered = privatePatients.filter(patient =>
        patient.name.toLowerCase().includes(privatePatientSearch.toLowerCase()) ||
        patient.cpf.includes(privatePatientSearch.replace(/\D/g, ''))
      );
      setFilteredPrivatePatients(filtered);
    } else {
      setFilteredPrivatePatients([]);
    }
  }, [privatePatientSearch, privatePatients]);

  const selectPrivatePatient = (patient: PrivatePatient) => {
    setFormData(prev => ({ ...prev, private_patient_id: patient.id.toString() }));
    setPrivatePatientSearch(patient.name);
    setFilteredPrivatePatients([]);
  };

  const clearPrivatePatientSelection = () => {
    setFormData(prev => ({ ...prev, private_patient_id: '' }));
    setPrivatePatientSearch('');
    setFilteredPrivatePatients([]);
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      // Helper function to safely fetch and parse JSON
      const safeFetch = async (url: string, options: any) => {
        try {
          const response = await fetch(url, options);
          
          // Check if response is actually JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            console.warn(`Non-JSON response from ${url}:`, response.status);
            return { ok: false, data: null };
          }
          
          if (!response.ok) {
            return { ok: false, data: null };
          }
          
          const data = await response.json();
          return { ok: true, data };
        } catch (error) {
          console.warn(`Error fetching ${url}:`, error);
          return { ok: false, data: null };
        }
      };

      // Fetch appointments
      const appointmentsResult = await safeFetch(`${apiUrl}/api/appointments`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (appointmentsResult.ok && appointmentsResult.data) {
        setAppointments(appointmentsResult.data);
      } else {
        console.warn('Appointments not available, using empty array');
        setAppointments([]);
      }

      // Fetch services
      const servicesResult = await safeFetch(`${apiUrl}/api/services`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (servicesResult.ok && servicesResult.data) {
        setServices(servicesResult.data);
      } else {
        console.warn('Services not available, using empty array');
        setServices([]);
      }

      // Fetch clients
      const clientsResult = await safeFetch(`${apiUrl}/api/clients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (clientsResult.ok && clientsResult.data) {
        setClients(clientsResult.data);
      } else {
        console.warn('Clients not available, using empty array');
        setClients([]);
      }

      // Fetch dependents
      const dependentsResult = await safeFetch(`${apiUrl}/api/admin/dependents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (dependentsResult.ok && dependentsResult.data) {
        setDependents(dependentsResult.data);
      } else {
        console.warn('Dependents not available, using empty array');
        setDependents([]);
      }

      // Fetch private patients
      const privatePatientsResult = await safeFetch(`${apiUrl}/api/private-patients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (privatePatientsResult.ok && privatePatientsResult.data) {
        setPrivatePatients(privatePatientsResult.data);
      } else {
        console.warn('Private patients not available, using empty array');
        setPrivatePatients([]);
      }

      // Fetch attendance locations
      const locationsResult = await safeFetch(`${apiUrl}/api/attendance-locations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (locationsResult.ok && locationsResult.data) {
        setAttendanceLocations(locationsResult.data);
      } else {
        console.warn('Attendance locations not available, using empty array');
        setAttendanceLocations([]);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Alguns dados podem não estar disponíveis. A agenda funcionará com funcionalidade limitada.');
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setFormData({
      patient_type: 'convenio',
      client_id: '',
      dependent_id: '',
      private_patient_id: '',
      service_id: '',
      location_id: '',
      date: '',
      time: '',
      value: '',
      is_recurring: false,
      recurring_days: [],
      total_sessions: ''
    });
    setSelectedAppointment(null);
    setPrivatePatientSearch('');
    setFilteredPrivatePatients([]);
    setIsModalOpen(true);
  };

  const openEditModal = (appointment: Appointment) => {
    setModalMode('edit');
    setFormData({
      patient_type: appointment.private_patient_id ? 'private' : 'convenio',
      client_id: appointment.client_id?.toString() || '',
      dependent_id: appointment.dependent_id?.toString() || '',
      private_patient_id: appointment.private_patient_id?.toString() || '',
      service_id: '', // Would need to be fetched from consultation
      location_id: '', // Would need to be fetched
      date: appointment.date,
      time: appointment.time,
      value: appointment.value.toString(),
      is_recurring: appointment.is_recurring,
      recurring_days: appointment.recurring_days || [],
      total_sessions: appointment.total_sessions?.toString() || ''
    });
    setSelectedAppointment(appointment);
    setIsModalOpen(true);
  };

  const openRescheduleModal = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setRescheduleData({
      date: appointment.date,
      time: appointment.time
    });
    setShowRescheduleModal(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setError('');
    setSuccess('');
  };

  const closeRescheduleModal = () => {
    setShowRescheduleModal(false);
    setRescheduleData({ date: '', time: '' });
    setIsRescheduling(false);
    setError('');
    setSuccess('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleRecurringDaysChange = (day: string) => {
    setFormData(prev => ({
      ...prev,
      recurring_days: prev.recurring_days.includes(day)
        ? prev.recurring_days.filter(d => d !== day)
        : [...prev.recurring_days, day]
    }));
  };

  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const serviceId = e.target.value;
    setFormData(prev => ({ ...prev, service_id: serviceId }));

    const selectedService = services.find(s => s.id.toString() === serviceId);
    if (selectedService) {
      setFormData(prev => ({ ...prev, value: selectedService.base_price.toString() }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      const appointmentData = {
        patient_type: formData.patient_type,
        client_id: formData.client_id ? parseInt(formData.client_id) : null,
        dependent_id: formData.dependent_id ? parseInt(formData.dependent_id) : null,
        private_patient_id: formData.private_patient_id ? parseInt(formData.private_patient_id) : null,
        service_id: parseInt(formData.service_id),
        location_id: formData.location_id ? parseInt(formData.location_id) : null,
        date: formData.date,
        time: formData.time,
        value: parseFloat(formData.value),
        is_recurring: formData.is_recurring,
        recurring_days: formData.is_recurring ? formData.recurring_days : null,
        total_sessions: formData.is_recurring && formData.total_sessions ? parseInt(formData.total_sessions) : null
      };

      const url = modalMode === 'create' 
        ? `${apiUrl}/api/appointments`
        : `${apiUrl}/api/appointments/${selectedAppointment?.id}`;

      const method = modalMode === 'create' ? 'POST' : 'PUT';

      console.log('🔄 Submitting appointment data:', appointmentData);
      
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(appointmentData)
      });

      console.log('📡 Appointment response status:', response.status);
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('❌ Non-JSON response received:', response.status);
        const textResponse = await response.text();
        console.error('❌ Response content:', textResponse.substring(0, 200));
        throw new Error(`Erro no servidor: resposta inválida (${response.status})`);
      }

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Appointment creation failed:', errorData);
        throw new Error(errorData.message || 'Erro ao salvar agendamento');
      }

      const responseData = await response.json();
      console.log('✅ Appointment saved successfully:', responseData);

      setSuccess(modalMode === 'create' ? 'Agendamento criado com sucesso!' : 'Agendamento atualizado com sucesso!');
      await fetchData();

      setTimeout(() => {
        closeModal();
      }, 1500);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao salvar agendamento');
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppointment) return;

    try {
      setIsRescheduling(true);
      setError('');
      setSuccess('');

      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/api/appointments/${selectedAppointment.id}/reschedule`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date: rescheduleData.date,
          time: rescheduleData.time
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao reagendar');
      }

      setSuccess('Consulta reagendada com sucesso!');
      await fetchData();

      setTimeout(() => {
        closeRescheduleModal();
      }, 1500);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao reagendar consulta');
    } finally {
      setIsRescheduling(false);
    }
  };

  const updateAppointmentStatus = async (appointmentId: number, status: 'completed' | 'cancelled') => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/api/appointments/${appointmentId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao atualizar status');
      }

      setSuccess(`Consulta ${status === 'completed' ? 'marcada como realizada' : 'cancelada'} com sucesso!`);
      await fetchData();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao atualizar status');
    }
  };

  const confirmDelete = (appointment: Appointment) => {
    setAppointmentToDelete(appointment);
    setShowDeleteConfirm(true);
  };

  const cancelDelete = () => {
    setAppointmentToDelete(null);
    setShowDeleteConfirm(false);
  };

  const deleteAppointment = async () => {
    if (!appointmentToDelete) return;

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/api/appointments/${appointmentToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao excluir agendamento');
      }

      await fetchData();
      setSuccess('Agendamento excluído com sucesso!');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao excluir agendamento');
    } finally {
      setAppointmentToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  // 🔥 NOVA FUNÇÃO: Abrir WhatsApp com mensagem automática
  const openWhatsApp = (appointment: Appointment) => {
    if (!appointment.client_phone) {
      setError('Cliente não possui telefone cadastrado');
      return;
    }

    // Limpar o número (apenas dígitos)
    const cleanPhone = appointment.client_phone.replace(/\D/g, '');
    
    // Verificar se tem 10 ou 11 dígitos (formato brasileiro)
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      setError('Número de telefone inválido');
      return;
    }

    // Formatar data e hora
    const appointmentDate = format(new Date(appointment.date), "dd/MM/yyyy", { locale: ptBR });
    const appointmentTime = appointment.time;

    // Criar mensagem automática
    const message = `Olá ${appointment.client_name}, gostaria de confirmar o seu agendamento com ${user?.name} no dia ${appointmentDate} às ${appointmentTime}`;

    // Criar URL do WhatsApp (55 = Brasil, 64 = Goiás)
    const whatsappUrl = `https://wa.me/5564${cleanPhone}?text=${encodeURIComponent(message)}`;

    // Abrir em nova aba
    window.open(whatsappUrl, '_blank');
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'scheduled':
        return {
          text: 'Agendado',
          className: 'bg-blue-100 text-blue-800',
          icon: <Clock className="h-3 w-3 mr-1" />
        };
      case 'completed':
        return {
          text: 'Realizado',
          className: 'bg-green-100 text-green-800',
          icon: <CheckCircle className="h-3 w-3 mr-1" />
        };
      case 'cancelled':
        return {
          text: 'Cancelado',
          className: 'bg-red-100 text-red-800',
          icon: <XCircle className="h-3 w-3 mr-1" />
        };
      default:
        return {
          text: status,
          className: 'bg-gray-100 text-gray-800',
          icon: null
        };
    }
  };

  const formatDateTime = (date: string, time: string) => {
    try {
      const dateTime = new Date(`${date}T${time}`);
      return format(dateTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch (error) {
      return `${date} às ${time}`;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const weekDays = [
    { value: 'monday', label: 'Segunda' },
    { value: 'tuesday', label: 'Terça' },
    { value: 'wednesday', label: 'Quarta' },
    { value: 'thursday', label: 'Quinta' },
    { value: 'friday', label: 'Sexta' },
    { value: 'saturday', label: 'Sábado' },
    { value: 'sunday', label: 'Domingo' }
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda de Consultas</h1>
          <p className="text-gray-600">Gerencie seus agendamentos e consultas</p>
        </div>

        <button
          onClick={openCreateModal}
          className="btn btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Agendamento
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
          <option value="completed">Realizado</option>
          <option value="cancelled">Cancelado</option>
        </select>

        <button
          onClick={() => {
            setSearchTerm('');
            setStatusFilter('');
          }}
          className="btn btn-secondary"
        >
          Limpar Filtros
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
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
            <p className="text-gray-600">Carregando agendamentos...</p>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || statusFilter ? 'Nenhum agendamento encontrado' : 'Nenhum agendamento cadastrado'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || statusFilter
                ? 'Tente ajustar os filtros de busca.'
                : 'Comece criando seu primeiro agendamento.'
              }
            </p>
            {!searchTerm && !statusFilter && (
              <button
                onClick={openCreateModal}
                className="btn btn-primary inline-flex items-center"
              >
                <Plus className="h-5 w-5 mr-2" />
                Criar Primeiro Agendamento
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
                    Serviço
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data/Hora
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Local
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
                {filteredAppointments.map((appointment) => {
                  const statusInfo = getStatusDisplay(appointment.status);
                  return (
                    <tr key={appointment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                              {appointment.private_patient_id ? (
                                <User className="h-5 w-5 text-red-600" />
                              ) : (
                                <Users className="h-5 w-5 text-red-600" />
                              )}
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {appointment.client_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {appointment.private_patient_id ? 'Particular' : 'Convênio'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{appointment.service_name}</div>
                        {appointment.is_recurring && (
                          <div className="flex items-center mt-1">
                            <RefreshCw className="h-3 w-3 text-purple-600 mr-1" />
                            <span className="text-xs text-purple-600">Recorrente</span>
                            {appointment.session_count && appointment.total_sessions && (
                              <span className="ml-1 px-1 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                                {appointment.session_count}/{appointment.total_sessions}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <CalendarDays className="h-3 w-3 mr-1" />
                          {formatDateTime(appointment.date, appointment.time)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-500">
                          <MapPin className="h-3 w-3 mr-1" />
                          {appointment.location_name || 'Não informado'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full flex items-center w-fit ${statusInfo.className}`}>
                          {statusInfo.icon}
                          {statusInfo.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(appointment.value)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          {/* 🔥 BOTÃO WHATSAPP - só aparece se status = agendado e tem telefone */}
                          {appointment.status === 'scheduled' && appointment.client_phone && (
                            <button
                              onClick={() => openWhatsApp(appointment)}
                              className="text-green-600 hover:text-green-900"
                              title="Confirmar via WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </button>
                          )}
                          
                          {appointment.status === 'scheduled' && (
                            <>
                              <button
                                onClick={() => openRescheduleModal(appointment)}
                                className="text-blue-600 hover:text-blue-900"
                                title="Reagendar"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => updateAppointmentStatus(appointment.id, 'completed')}
                                className="text-green-600 hover:text-green-900"
                                title="Marcar como realizada"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => updateAppointmentStatus(appointment.id, 'cancelled')}
                                className="text-red-600 hover:text-red-900"
                                title="Cancelar"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => confirmDelete(appointment)}
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

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">
                {modalMode === 'create' ? 'Novo Agendamento' : 'Editar Agendamento'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-6">
                {/* Patient Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Paciente
                  </label>
                  <select
                    name="patient_type"
                    value={formData.patient_type}
                    onChange={handleInputChange}
                    className="input"
                    required
                  >
                    <option value="convenio">Convênio</option>
                    <option value="private">Particular</option>
                  </select>
                </div>

                {/* Patient Selection */}
                {formData.patient_type === 'convenio' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Cliente
                      </label>
                      <select
                        name="client_id"
                        value={formData.client_id}
                        onChange={handleInputChange}
                        className="input"
                      >
                        <option value="">Selecione um cliente</option>
                        {clients.filter(c => c.subscription_status === 'active').map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Dependente (opcional)
                      </label>
                      <select
                        name="dependent_id"
                        value={formData.dependent_id}
                        onChange={handleInputChange}
                        className="input"
                      >
                        <option value="">Consulta para o titular</option>
                        {dependents
                          .filter(d => d.subscription_status === 'active')
                          .map((dependent) => (
                          <option key={dependent.id} value={dependent.id}>
                            {dependent.name} (Titular: {dependent.client_name})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Buscar Paciente Particular
                    </label>
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Digite o nome do paciente..."
                        value={privatePatientSearch}
                        onChange={(e) => setPrivatePatientSearch(e.target.value)}
                        className="input"
                      />
                      
                      {privatePatientSearch && filteredPrivatePatients.length > 0 && (
                        <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto">
                          {filteredPrivatePatients.map((patient) => (
                            <button
                              key={patient.id}
                              type="button"
                              onClick={() => selectPrivatePatient(patient)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                            >
                              <div className="font-medium">{patient.name}</div>
                              {patient.cpf && (
                                <div className="text-sm text-gray-500">
                                  CPF: {patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {formData.private_patient_id && (
                        <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-green-800">
                                {privatePatients.find(p => p.id.toString() === formData.private_patient_id)?.name}
                              </p>
                              <p className="text-sm text-green-600">Paciente selecionado</p>
                            </div>
                            <button
                              type="button"
                              onClick={clearPrivatePatientSelection}
                              className="text-green-600 hover:text-green-800"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {privatePatientSearch && filteredPrivatePatients.length === 0 && (
                        <div className="text-center py-3 text-gray-500 text-sm">
                          Nenhum paciente encontrado
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Service and Location */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Serviço *
                    </label>
                    <select
                      name="service_id"
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Local de Atendimento
                    </label>
                    <select
                      name="location_id"
                      value={formData.location_id}
                      onChange={handleInputChange}
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

                {/* Date, Time and Value */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data *
                    </label>
                    <input
                      type="date"
                      name="date"
                      value={formData.date}
                      onChange={handleInputChange}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Hora *
                    </label>
                    <input
                      type="time"
                      name="time"
                      value={formData.time}
                      onChange={handleInputChange}
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valor (R$) *
                    </label>
                    <input
                      type="number"
                      name="value"
                      value={formData.value}
                      onChange={handleInputChange}
                      className="input"
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                </div>

                {/* Recurring Options */}
                <div>
                  <label className="flex items-center mb-4">
                    <input
                      type="checkbox"
                      name="is_recurring"
                      checked={formData.is_recurring}
                      onChange={handleInputChange}
                      className="rounded border-gray-300 text-red-600 shadow-sm focus:border-red-300 focus:ring focus:ring-red-200 focus:ring-opacity-50"
                    />
                    <span className="ml-2 text-sm text-gray-600">
                      Consulta recorrente (múltiplas sessões)
                    </span>
                  </label>

                  {formData.is_recurring && (
                    <div className="space-y-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Dias da Semana
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {weekDays.map((day) => (
                            <label key={day.value} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={formData.recurring_days.includes(day.value)}
                                onChange={() => handleRecurringDaysChange(day.value)}
                                className="rounded border-gray-300 text-purple-600 shadow-sm focus:border-purple-300 focus:ring focus:ring-purple-200 focus:ring-opacity-50"
                              />
                              <span className="ml-2 text-sm text-gray-600">
                                {day.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Total de Sessões
                        </label>
                        <input
                          type="number"
                          name="total_sessions"
                          value={formData.total_sessions}
                          onChange={handleInputChange}
                          className="input"
                          min="1"
                          max="20"
                          placeholder="Ex: 5"
                        />
                      </div>
                    </div>
                  )}
                </div>
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
                  {modalMode === 'create' ? 'Criar Agendamento' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">Reagendar Consulta</h2>
              <p className="text-gray-600 mt-1">
                Paciente: {selectedAppointment.client_name}
              </p>
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

            <form onSubmit={handleReschedule} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nova Data *
                  </label>
                  <input
                    type="date"
                    value={rescheduleData.date}
                    onChange={(e) => setRescheduleData(prev => ({ ...prev, date: e.target.value }))}
                    className="input"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nova Hora *
                  </label>
                  <input
                    type="time"
                    value={rescheduleData.time}
                    onChange={(e) => setRescheduleData(prev => ({ ...prev, time: e.target.value }))}
                    className="input"
                    required
                  />
                </div>

                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <strong>Agendamento atual:</strong> {formatDateTime(selectedAppointment.date, selectedAppointment.time)}
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={closeRescheduleModal}
                  className="btn btn-secondary"
                  disabled={isRescheduling}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className={`btn btn-primary ${isRescheduling ? 'opacity-70 cursor-not-allowed' : ''}`}
                  disabled={isRescheduling}
                >
                  {isRescheduling ? 'Reagendando...' : 'Reagendar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && appointmentToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Confirmar Exclusão</h2>
            
            <p className="mb-6">
              Tem certeza que deseja excluir o agendamento de <strong>{appointmentToDelete.client_name}</strong>?
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
                onClick={deleteAppointment}
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