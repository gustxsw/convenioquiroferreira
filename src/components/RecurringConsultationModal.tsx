import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Repeat, X, Check, AlertCircle } from 'lucide-react';

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

type RecurringConsultationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const RecurringConsultationModal: React.FC<RecurringConsultationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [services, setServices] = useState<Service[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [attendanceLocations, setAttendanceLocations] = useState<AttendanceLocation[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    patient_type: 'private' as 'convenio' | 'private',
    client_cpf: '',
    private_patient_id: '',
    service_id: '',
    value: '',
    location_id: '',
    start_date: '',
    start_time: '',
    recurrence_type: 'weekly' as 'daily' | 'weekly' | 'monthly',
    recurrence_interval: 1,
    end_date: '',
    occurrences: 10,
    notes: '',
  });

  // Client search state
  const [clientSearchResult, setClientSearchResult] = useState<any>(null);
  const [dependents, setDependents] = useState<any[]>([]);
  const [selectedDependentId, setSelectedDependentId] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);

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
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

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
      setError('Não foi possível carregar os dados necessários');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      setIsCreating(true);
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      // Prepare consultation data
      const consultationData: any = {
        service_id: parseInt(formData.service_id),
        location_id: formData.location_id ? parseInt(formData.location_id) : null,
        value: parseFloat(formData.value),
        start_date: formData.start_date,
        start_time: formData.start_time,
        recurrence_type: formData.recurrence_type,
        recurrence_interval: formData.recurrence_interval,
        end_date: formData.end_date || null,
        occurrences: formData.occurrences,
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

      const response = await fetch(`${apiUrl}/api/consultations/recurring`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(consultationData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao criar consultas recorrentes');
      }

      const result = await response.json();
      console.log('Recurring consultations created:', result);

      // Show success message with details
      alert(`${result.created_count || 'Múltiplas'} consultas recorrentes criadas com sucesso!`);
      
      onSuccess();
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao criar consultas recorrentes');
    } finally {
      setIsCreating(false);
    }
  };

  const formatCpf = (value: string) => {
    if (!value) return '';
    const numericValue = value.replace(/\D/g, '');
    return numericValue.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center">
              <Repeat className="h-6 w-6 text-red-600 mr-2" />
              Criar Consultas Recorrentes
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={isCreating}
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

        <form onSubmit={handleSubmit} className="p-6">
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

            {/* Start Date and Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Início *
                </label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData(prev => ({ ...prev, start_date: e.target.value }))
                  }
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Horário *
                </label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) =>
                    setFormData(prev => ({ ...prev, start_time: e.target.value }))
                  }
                  className="input"
                  required
                />
              </div>
            </div>

            {/* Recurrence Settings */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Repeat className="h-5 w-5 text-red-600 mr-2" />
                Configurações de Recorrência
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Recorrência *
                  </label>
                  <select
                    value={formData.recurrence_type}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        recurrence_type: e.target.value as 'daily' | 'weekly' | 'monthly',
                      }))
                    }
                    className="input"
                    required
                  >
                    <option value="daily">Diário</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Intervalo *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={formData.recurrence_interval}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        recurrence_interval: parseInt(e.target.value),
                      }))
                    }
                    className="input"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.recurrence_type === 'daily' && 'A cada quantos dias'}
                    {formData.recurrence_type === 'weekly' && 'A cada quantas semanas'}
                    {formData.recurrence_type === 'monthly' && 'A cada quantos meses'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Final (opcional)
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) =>
                      setFormData(prev => ({ ...prev, end_date: e.target.value }))
                    }
                    className="input"
                    min={formData.start_date}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número de Ocorrências *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.occurrences}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        occurrences: parseInt(e.target.value),
                      }))
                    }
                    className="input"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Máximo de consultas a serem criadas
                  </p>
                </div>
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
                placeholder="Observações sobre as consultas..."
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
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
                  Criando Consultas...
                </>
              ) : (
                <>
                  <Repeat className="h-5 w-5 mr-2" />
                  Criar Consultas Recorrentes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RecurringConsultationModal;