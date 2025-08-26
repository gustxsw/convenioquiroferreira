import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Calendar, 
  Plus, 
  Edit, 
  Trash2, 
  Clock, 
  User, 
  MapPin, 
  Phone,
  AlertCircle,
  CreditCard,
  Gift,
  CheckCircle,
  X,
  Check
} from 'lucide-react';

type Appointment = {
  id: number;
  appointment_date: string;
  appointment_time: string;
  status: string;
  notes: string;
  patient_type: string;
  service_name: string;
  service_price: number;
  location_name: string;
  patient_name: string;
  patient_phone: string;
};

type Service = {
  id: number;
  name: string;
  base_price: number;
  category_name: string;
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

type SchedulingAccessStatus = {
  hasAccess: boolean;
  isExpired: boolean;
  expiresAt: string | null;
  canPurchase: boolean;
};

const SchedulingPage: React.FC = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Scheduling access state
  const [accessStatus, setAccessStatus] = useState<SchedulingAccessStatus>({
    hasAccess: false,
    isExpired: false,
    expiresAt: null,
    canPurchase: true
  });
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isPurchasingAccess, setIsPurchasingAccess] = useState(false);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    private_patient_id: '',
    service_id: '',
    location_id: '',
    appointment_date: '',
    appointment_time: '',
    notes: ''
  });
  
  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [appointmentToDelete, setAppointmentToDelete] = useState<Appointment | null>(null);

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

  // Handle payment feedback from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get("payment");
    const paymentType = urlParams.get("type");

    if (paymentStatus && paymentType === "agenda") {
      if (paymentStatus === "success") {
        setSuccess("Pagamento do acesso à agenda aprovado! Seu acesso foi ativado.");
        setTimeout(() => {
          checkSchedulingAccess();
        }, 2000);
      } else if (paymentStatus === "failure") {
        setError("Falha no pagamento do acesso à agenda. Tente novamente.");
      } else if (paymentStatus === "pending") {
        setSuccess("Pagamento do acesso à agenda está sendo processado.");
      }

      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);

      setTimeout(() => {
        setError('');
        setSuccess('');
      }, 10000);
    }
  }, []);

  useEffect(() => {
    checkSchedulingAccess();
  }, []);

  useEffect(() => {
    if (accessStatus.hasAccess) {
      fetchData();
    }
  }, [selectedDate, accessStatus.hasAccess]);

  const checkSchedulingAccess = async () => {
    try {
      setIsCheckingAccess(true);
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      console.log('🔄 [SCHEDULING] Checking access status...');

      const response = await fetch(`${apiUrl}/api/professional/scheduling-access-status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('📡 [SCHEDULING] Access check response:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [SCHEDULING] Access status:', data);
        setAccessStatus(data);
        
        if (!data.hasAccess) {
          setError(data.isExpired 
            ? 'Seu acesso à agenda expirou. Renove para continuar usando.'
            : 'Você não possui acesso à agenda. Adquira o acesso para começar a usar.'
          );
        }
      } else {
        console.warn('⚠️ [SCHEDULING] Could not verify access status');
        setError('Não foi possível verificar o status de acesso à agenda');
      }
    } catch (error) {
      console.error('❌ [SCHEDULING] Error checking access:', error);
      setError('Erro ao verificar acesso à agenda');
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

      console.log('🔄 [SCHEDULING] Fetching scheduling data...');

      // Fetch appointments for selected date
      const appointmentsResponse = await fetch(
        `${apiUrl}/api/scheduling/appointments?date=${selectedDate}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      console.log('📡 [SCHEDULING] Appointments response:', appointmentsResponse.status);

      if (appointmentsResponse.ok) {
        const appointmentsData = await appointmentsResponse.json();
        console.log('✅ [SCHEDULING] Appointments loaded:', appointmentsData.length);
        setAppointments(appointmentsData);
      } else if (appointmentsResponse.status === 403) {
        console.warn('⚠️ [SCHEDULING] Access denied - refreshing access status');
        await checkSchedulingAccess();
        return;
      } else {
        console.warn('⚠️ [SCHEDULING] Appointments not available:', appointmentsResponse.status);
        setAppointments([]);
      }

      // Fetch services
      const servicesResponse = await fetch(`${apiUrl}/api/services`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('📡 [SCHEDULING] Services response:', servicesResponse.status);

      if (servicesResponse.ok) {
        const servicesData = await servicesResponse.json();
        console.log('✅ [SCHEDULING] Services loaded:', servicesData.length);
        setServices(servicesData);
      } else {
        console.warn('⚠️ [SCHEDULING] Services not available');
        setServices([]);
      }

      // Fetch locations
      const locationsResponse = await fetch(`${apiUrl}/api/attendance-locations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('📡 [SCHEDULING] Locations response:', locationsResponse.status);

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        console.log('✅ [SCHEDULING] Locations loaded:', locationsData.length);
        setLocations(locationsData);
        
        const defaultLocation = locationsData.find(loc => loc.is_default);
        if (defaultLocation && !formData.location_id) {
          setFormData(prev => ({ ...prev, location_id: defaultLocation.id.toString() }));
        }
      } else {
        console.warn('⚠️ [SCHEDULING] Locations not available');
        setLocations([]);
      }

      // Fetch private patients
      const patientsResponse = await fetch(`${apiUrl}/api/private-patients`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('📡 [SCHEDULING] Patients response:', patientsResponse.status);

      if (patientsResponse.ok) {
        const patientsData = await patientsResponse.json();
        console.log('✅ [SCHEDULING] Private patients loaded:', patientsData.length);
        setPrivatePatients(patientsData);
      } else {
        console.warn('⚠️ [SCHEDULING] Private patients not available');
        setPrivatePatients([]);
      }

    } catch (error) {
      console.error('❌ [SCHEDULING] Error fetching data:', error);
      setError('Não foi possível carregar os dados da agenda');
    } finally {
      setIsLoading(false);
    }
  };

  const purchaseSchedulingAccess = async () => {
    try {
      setIsPurchasingAccess(true);
      setError('');
      
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      console.log('🔄 [SCHEDULING] Creating agenda payment...');

      const response = await fetch(`${apiUrl}/api/professional/create-agenda-payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          duration_days: 30
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao criar pagamento');
      }

      const data = await response.json();
      window.open(data.init_point, '_blank');
      setSuccess('Redirecionando para o pagamento...');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao processar pagamento');
    } finally {
      setIsPurchasingAccess(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setFormData({
      private_patient_id: '',
      service_id: '',
      location_id: locations.find(l => l.is_default)?.id.toString() || '',
      appointment_date: selectedDate,
      appointment_time: '',
      notes: ''
    });
    setSelectedAppointment(null);
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const openEditModal = (appointment: Appointment) => {
    setModalMode('edit');
    setFormData({
      private_patient_id: '', // Would need patient ID from appointment
      service_id: '', // Would need service ID from appointment
      location_id: '', // Would need location ID from appointment
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      notes: appointment.notes || ''
    });
    setSelectedAppointment(appointment);
    setError('');
    setSuccess('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setError('');
    setSuccess('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    console.log('🔄 [SCHEDULING] Submitting appointment form:', formData);

    // Validate required fields
    if (!formData.private_patient_id) {
      setError('Selecione um paciente');
      return;
    }
    if (!formData.service_id) {
      setError('Selecione um serviço');
      return;
    }
    if (!formData.appointment_date) {
      setError('Selecione uma data');
      return;
    }
    if (!formData.appointment_time) {
      setError('Selecione um horário');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      const appointmentData = {
        private_patient_id: parseInt(formData.private_patient_id),
        service_id: parseInt(formData.service_id),
        location_id: formData.location_id ? parseInt(formData.location_id) : null,
        appointment_date: formData.appointment_date,
        appointment_time: formData.appointment_time,
        notes: formData.notes || null
      };

      console.log('🔄 [SCHEDULING] Sending appointment data:', appointmentData);

      const url = modalMode === 'create' 
        ? `${apiUrl}/api/scheduling/appointments`
        : `${apiUrl}/api/scheduling/appointments/${selectedAppointment?.id}`;

      const method = modalMode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(appointmentData)
      });

      console.log('📡 [SCHEDULING] Appointment submission response:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [SCHEDULING] Appointment submission error:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          throw new Error(`Erro de comunicação: ${response.status}`);
        }
        
        if (response.status === 403) {
          await checkSchedulingAccess();
          return;
        }
        
        throw new Error(errorData.message || 'Erro ao salvar agendamento');
      }

      const responseData = await response.json();
      console.log('✅ [SCHEDULING] Appointment saved:', responseData);

      setSuccess(modalMode === 'create' ? 'Agendamento criado com sucesso!' : 'Agendamento atualizado com sucesso!');
      await fetchData();

      setTimeout(() => {
        closeModal();
      }, 1500);
    } catch (error) {
      console.error('❌ [SCHEDULING] Error in handleSubmit:', error);
      setError(error instanceof Error ? error.message : 'Erro ao salvar agendamento');
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

      console.log('🔄 [SCHEDULING] Deleting appointment:', appointmentToDelete.id);

      const response = await fetch(`${apiUrl}/api/scheduling/appointments/${appointmentToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('📡 [SCHEDULING] Delete response:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao excluir agendamento');
      }

      console.log('✅ [SCHEDULING] Appointment deleted successfully');
      await fetchData();
      setSuccess('Agendamento excluído com sucesso!');
    } catch (error) {
      console.error('❌ [SCHEDULING] Error deleting appointment:', error);
      setError(error instanceof Error ? error.message : 'Erro ao excluir agendamento');
    } finally {
      setAppointmentToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  const formatTime = (timeString: string) => {
    return timeString.slice(0, 5);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'scheduled':
        return { text: 'Agendado', className: 'bg-blue-100 text-blue-800' };
      case 'completed':
        return { text: 'Concluído', className: 'bg-green-100 text-green-800' };
      case 'cancelled':
        return { text: 'Cancelado', className: 'bg-red-100 text-red-800' };
      case 'no_show':
        return { text: 'Faltou', className: 'bg-yellow-100 text-yellow-800' };
      default:
        return { text: status, className: 'bg-gray-100 text-gray-800' };
    }
  };

  // Show access control screen if no access
  if (isCheckingAccess) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Verificando acesso à agenda...</p>
      </div>
    );
  }

  if (!accessStatus.hasAccess) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Agenda de Atendimentos</h1>
          <p className="text-gray-600">Sistema de agendamento para profissionais</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Calendar className="h-10 w-10 text-red-600" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {accessStatus.isExpired ? 'Acesso à Agenda Expirado' : 'Acesso à Agenda Necessário'}
            </h2>
            
            <p className="text-gray-600 mb-6">
              {accessStatus.isExpired 
                ? 'Seu acesso à agenda expirou. Renove para continuar agendando consultas.'
                : 'Para usar o sistema de agendamentos, você precisa adquirir o acesso à agenda.'
              }
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h3 className="font-semibold text-blue-900 mb-3">O que está incluído no acesso à agenda:</h3>
            <ul className="text-sm text-blue-700 space-y-2 text-left max-w-md mx-auto">
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                Sistema completo de agendamentos
              </li>
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                Gestão de pacientes particulares
              </li>
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                Prontuários médicos digitais
              </li>
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                Geração de documentos médicos
              </li>
              <li className="flex items-center">
                <CheckCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                Relatórios detalhados
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-center mb-2">
                <Gift className="h-5 w-5 text-green-600 mr-2" />
                <span className="font-semibold text-green-900">Oferta Especial</span>
              </div>
              <p className="text-2xl font-bold text-green-700 mb-1">R$ 24,99</p>
              <p className="text-sm text-green-600">Acesso por 30 dias</p>
            </div>

            {accessStatus.canPurchase && (
              <button
                onClick={purchaseSchedulingAccess}
                className={`btn btn-primary w-full max-w-md mx-auto flex items-center justify-center ${
                  isPurchasingAccess ? 'opacity-70 cursor-not-allowed' : ''
                }`}
                disabled={isPurchasingAccess}
              >
                {isPurchasingAccess ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Processando...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-5 w-5 mr-2" />
                    Adquirir Acesso à Agenda
                  </>
                )}
              </button>
            )}

            <div className="text-center">
              <p className="text-sm text-gray-500">
                Ou entre em contato com o administrador para liberação gratuita
              </p>
              <p className="text-sm text-gray-500">
                Telefone: (64) 98124-9199
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda de Atendimentos</h1>
          <p className="text-gray-600">Gerencie seus agendamentos</p>
          
          {accessStatus.expiresAt && (
            <div className="mt-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <Gift className="h-3 w-3 mr-1" />
                Acesso ativo até {formatDate(accessStatus.expiresAt)}
              </span>
            </div>
          )}
        </div>
        
        <button
          onClick={openCreateModal}
          className="btn btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Agendamento
        </button>
      </div>

      {/* Date selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Calendar className="h-6 w-6 text-red-600 mr-2" />
            <h2 className="text-xl font-semibold">Agendamentos para {formatDate(selectedDate)}</h2>
          </div>
          
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="input w-auto"
          />
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

      {/* Appointments list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando agendamentos...</p>
          </div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhum agendamento para {formatDate(selectedDate)}
            </h3>
            <p className="text-gray-600 mb-4">
              Comece criando seu primeiro agendamento do dia.
            </p>
            <button
              onClick={openCreateModal}
              className="btn btn-primary inline-flex items-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Criar Primeiro Agendamento
            </button>
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
                    Local
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {appointments.map((appointment) => {
                  const statusInfo = getStatusDisplay(appointment.status);
                  return (
                    <tr key={appointment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">
                            {formatTime(appointment.appointment_time)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="h-4 w-4 text-purple-600 mr-2" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {appointment.patient_name}
                            </div>
                            {appointment.patient_phone && (
                              <div className="text-sm text-gray-500 flex items-center">
                                <Phone className="h-3 w-3 mr-1" />
                                {appointment.patient_phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {appointment.service_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-500">
                          <MapPin className="h-3 w-3 mr-1" />
                          {appointment.location_name || 'Não especificado'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusInfo.className}`}>
                          {statusInfo.text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openEditModal(appointment)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
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

      {/* Appointment form modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">
                  {modalMode === 'create' ? 'Novo Agendamento' : 'Editar Agendamento'}
                </h2>
                <button
                  onClick={closeModal}
                  className="text-gray-500 hover:text-gray-700"
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
                {/* Patient Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Paciente Particular *
                  </label>
                  <select
                    name="private_patient_id"
                    value={formData.private_patient_id}
                    onChange={handleInputChange}
                    className="input"
                    required
                  >
                    <option value="">Selecione um paciente</option>
                    {privatePatients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name}
                        {patient.cpf && ` - CPF: ${patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`}
                      </option>
                    ))}
                  </select>
                  {privatePatients.length === 0 && (
                    <p className="text-sm text-red-600 mt-1">
                      Você precisa cadastrar pacientes particulares primeiro.
                    </p>
                  )}
                </div>

                {/* Service Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serviço *
                  </label>
                  <select
                    name="service_id"
                    value={formData.service_id}
                    onChange={handleInputChange}
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

                {/* Location Selection */}
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
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name} {location.is_default && '(Padrão)'}
                      </option>
                    ))}
                  </select>
                  {locations.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">
                      Configure seus locais de atendimento no perfil.
                    </p>
                  )}
                </div>

                {/* Date and Time */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data *
                    </label>
                    <input
                      type="date"
                      name="appointment_date"
                      value={formData.appointment_date}
                      onChange={handleInputChange}
                      className="input"
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Horário *
                    </label>
                    <input
                      type="time"
                      name="appointment_time"
                      value={formData.appointment_time}
                      onChange={handleInputChange}
                      className="input"
                      required
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observações
                  </label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleInputChange}
                    className="input min-h-[80px]"
                    placeholder="Observações sobre o agendamento..."
                  />
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
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={!formData.private_patient_id || !formData.service_id || !formData.appointment_date || !formData.appointment_time}
                >
                  {modalMode === 'create' ? 'Criar Agendamento' : 'Salvar Alterações'}
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
              Tem certeza que deseja excluir o agendamento de <strong>{appointmentToDelete.patient_name}</strong> 
              para {formatTime(appointmentToDelete.appointment_time)}?
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