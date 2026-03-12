import type React from "react";
import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  Calendar,
  Clock,
  User,
  Users,
  X,
  Check,
  AlertCircle,
  Search,
} from "lucide-react";
import { toUTCString } from "../utils/dateHelpers";
import { fetchWithAuth, getApiUrl } from "../utils/apiHelpers";
import ScheduleConflictModal from "./ScheduleConflictModal";

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

type Client = {
  id: number;
  name: string;
  cpf: string;
  subscription_status: string;
};

type Dependent = {
  id: number;
  name: string;
  cpf: string;
  client_id: number;
  client_name: string;
};

type PrivatePatient = {
  id: number;
  name: string;
  cpf: string;
};

type QuickScheduleModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedSlot: {
    date: string;
    time: string;
  } | null;
};

const QuickScheduleModal: React.FC<QuickScheduleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  selectedSlot,
}) => {
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [attendanceLocations, setAttendanceLocations] = useState<
    AttendanceLocation[]
  >([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState<
    Array<{
      date: string;
      time: string;
      clientName: string;
    }>
  >([]);

  const [patientType, setPatientType] = useState<"convenio" | "private">(
    "convenio"
  );
  const [searchCpf, setSearchCpf] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [foundClient, setFoundClient] = useState<Client | null>(null);
  const [foundDependent, setFoundDependent] = useState<Dependent | null>(null);
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [selectedDependentId, setSelectedDependentId] = useState<number | null>(
    null
  );
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);

  const [privatePatientSearch, setPrivatePatientSearch] = useState("");
  const [showPrivatePatientDropdown, setShowPrivatePatientDropdown] =
    useState(false);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [selectedPrivatePatient, setSelectedPrivatePatient] =
    useState<PrivatePatient | null>(null);
  const [showQuickPrivatePatientModal, setShowQuickPrivatePatientModal] =
    useState(false);
  const [isSavingQuickPatient, setIsSavingQuickPatient] = useState(false);
  const [quickPatientForm, setQuickPatientForm] = useState({
    name: "",
    cpf: "",
    email: "",
    phone: "",
    birth_date: "",
    address: "",
    address_number: "",
    address_complement: "",
    neighborhood: "",
    city: "",
    state: "",
    zip_code: "",
  });

  const [formData, setFormData] = useState({
    service_id: "",
    value: "",
    location_id: "",
    notes: "",
    private_patient_id: "",
  });

  useEffect(() => {
    if (isOpen) {
      fetchData();
      resetForm();
    }
  }, [isOpen]);

  const fetchData = async () => {
    try {
      const apiUrl = getApiUrl();

      const servicesResponse = await fetchWithAuth(`${apiUrl}/api/services`);

      if (servicesResponse.ok) {
        const servicesData = await servicesResponse.json();
        setServices(servicesData);
      }

      const locationsResponse = await fetchWithAuth(
        `${apiUrl}/api/attendance-locations`
      );

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        setAttendanceLocations(locationsData);

        const defaultLocation = locationsData.find(
          (loc: AttendanceLocation) => loc.is_default
        );
        if (defaultLocation) {
          setFormData((prev) => ({
            ...prev,
            location_id: defaultLocation.id.toString(),
          }));
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setError("Não foi possível carregar os dados necessários");
    }
  };

  const resetForm = () => {
    setSearchCpf("");
    setFoundClient(null);
    setFoundDependent(null);
    setDependents([]);
    setSelectedDependentId(null);
    setPrivatePatientSearch("");
    setShowPrivatePatientDropdown(false);
    setPrivatePatients([]);
    setSelectedPrivatePatient(null);
    setFormData({
      service_id: "",
      value: "",
      location_id: "",
      notes: "",
      private_patient_id: "",
    });
    setError("");
    setConflictData([]);
    setShowConflictModal(false);
    setShowQuickPrivatePatientModal(false);
  };

  const searchByCpf = async () => {
    if (!searchCpf) return;

    try {
      setIsSearching(true);
      setError("");

      const apiUrl = getApiUrl();
      const cleanCpf = searchCpf.replace(/\D/g, "");

      const dependentResponse = await fetchWithAuth(
        `${apiUrl}/api/dependents/search?cpf=${cleanCpf}`
      );

      if (dependentResponse.ok) {
        const dependentData = await dependentResponse.json();

        if (dependentData.status !== "active") {
          setError("Este dependente não possui assinatura ativa.");
          return;
        }

        setFoundDependent(dependentData);
        setFoundClient(null);
        setDependents([]);
        setSelectedDependentId(dependentData.id);
        return;
      }

      const clientResponse = await fetchWithAuth(
        `${apiUrl}/api/clients/lookup?cpf=${cleanCpf}`
      );

      if (!clientResponse.ok) {
        if (clientResponse.status === 404) {
          setError("Cliente ou dependente não encontrado.");
        } else {
          setError("Erro ao buscar cliente.");
        }
        return;
      }

      const clientData = await clientResponse.json();

      if (clientData.subscription_status !== "active") {
        setError("Este cliente não possui assinatura ativa.");
        return;
      }

      setFoundClient(clientData);
      setFoundDependent(null);
      setSelectedDependentId(null);

      const dependentsResponse = await fetchWithAuth(
        `${apiUrl}/api/dependents?client_id=${clientData.id}&status=active`
      );

      if (dependentsResponse.ok) {
        const dependentsData = await dependentsResponse.json();
        setDependents(dependentsData);
      }
    } catch (error) {
      setError("Erro ao buscar paciente.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const serviceId = e.target.value;
    setFormData((prev) => ({ ...prev, service_id: serviceId }));

    const service = services.find((s) => s.id.toString() === serviceId);
    if (service) {
      setFormData((prev) => ({
        ...prev,
        value: service.base_price.toString(),
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setShowConflictModal(false);
    setConflictData([]);

    if (!selectedSlot) return;

    if (patientType === "convenio") {
      if (!foundClient && !foundDependent) {
        setError("Busque e selecione um cliente ou dependente");
        return;
      }
    } else {
      if (!formData.private_patient_id) {
        setError("Selecione um paciente particular");
        return;
      }
    }

    try {
      setIsCreating(true);
      const apiUrl = getApiUrl();

      const dateTimeUTC = toUTCString(selectedSlot.date, selectedSlot.time);

      const consultationData: any = {
        professional_id: user?.id,
        service_id: Number.parseInt(formData.service_id),
        location_id: formData.location_id
          ? Number.parseInt(formData.location_id)
          : null,
        value: Number.parseFloat(formData.value),
        date: dateTimeUTC,
        status: "scheduled",
        notes: formData.notes.trim() || null,
      };

      if (patientType === "private") {
        consultationData.private_patient_id = Number.parseInt(
          formData.private_patient_id || ""
        );
      } else {
        if (foundDependent) {
          consultationData.dependent_id = foundDependent.id;
        } else if (selectedDependentId) {
          consultationData.dependent_id = selectedDependentId;
        } else if (foundClient) {
          consultationData.user_id = foundClient.id;
        }
      }

      console.log("🔄 Quick schedule consultation data:", consultationData);
      const response = await fetchWithAuth(`${apiUrl}/api/consultations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(consultationData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ Quick schedule error:", errorData);
        if (
          response.status === 409 &&
          errorData.conflict &&
          errorData.conflictDetails
        ) {
          setConflictData([errorData.conflictDetails]);
          setShowConflictModal(true);
          setError("");
        } else {
          setError(errorData.message || "Falha ao agendar consulta");
        }
        return;
      }

      onSuccess();
      onClose();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Erro ao agendar consulta"
      );
    } finally {
      setIsCreating(false);
    }
  };

  const formatCpf = (value: string) => {
    const numericValue = value.replace(/\D/g, "");
    return numericValue.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  useEffect(() => {
    if (!isOpen || patientType !== "private") {
      return;
    }

    const searchTerm = privatePatientSearch.trim();

    if (!searchTerm) {
      setPrivatePatients([]);
      setIsLoadingPatients(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsLoadingPatients(true);
        const apiUrl = getApiUrl();
        const response = await fetchWithAuth(
          `${apiUrl}/api/private-patients?q=${encodeURIComponent(searchTerm)}&limit=50`
        );

        if (response.ok) {
          const patientsData = await response.json();
          setPrivatePatients(Array.isArray(patientsData) ? patientsData : []);
        } else {
          setPrivatePatients([]);
        }
      } catch (err) {
        setPrivatePatients([]);
      } finally {
        setIsLoadingPatients(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [privatePatientSearch, patientType, isOpen]);

  const handlePrivatePatientSelect = (patient: PrivatePatient) => {
    setSelectedPrivatePatient(patient);
    setFormData((prev) => ({
      ...prev,
      private_patient_id: patient.id.toString(),
    }));
    setPrivatePatientSearch(patient.name);
    setShowPrivatePatientDropdown(false);
  };

  const openQuickPrivatePatientModal = () => {
    setQuickPatientForm({
      name: privatePatientSearch.trim(),
      cpf: "",
      email: "",
      phone: "",
      birth_date: "",
      address: "",
      address_number: "",
      address_complement: "",
      neighborhood: "",
      city: "",
      state: "",
      zip_code: "",
    });
    setShowQuickPrivatePatientModal(true);
  };

  const handleCreateQuickPrivatePatient = async () => {
    if (!quickPatientForm.name.trim()) {
      setError("Nome é obrigatório");
      setTimeout(() => setError(""), 3000);
      return;
    }

    try {
      setIsSavingQuickPatient(true);
      setError("");
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}/api/private-patients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quickPatientForm),
      });

      if (response.ok) {
        const data = await response.json();
        const patient = data.patient;
        setPrivatePatients((prev) => [patient, ...prev]);
        setSelectedPrivatePatient(patient);
        setFormData((prev) => ({
          ...prev,
          private_patient_id: patient.id.toString(),
        }));
        setPrivatePatientSearch(patient.name);
        setShowPrivatePatientDropdown(false);
        setShowQuickPrivatePatientModal(false);
      } else {
        const errorData = await response.json();
        setError(errorData.message || "Erro ao cadastrar paciente");
      }
    } catch (err) {
      setError("Erro ao cadastrar paciente");
    } finally {
      setIsSavingQuickPatient(false);
    }
  };

  if (!isOpen || !selectedSlot) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center">
                <Calendar className="h-6 w-6 text-red-600 mr-2" />
                Agendar Consulta
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

          <div className="p-6 border-b border-gray-200 bg-blue-50">
            <div className="flex items-center">
              <Clock className="h-5 w-5 text-blue-600 mr-2" />
              <div>
                <p className="font-medium text-blue-900">
                  {new Date(`${selectedSlot.date}T12:00:00`).toLocaleDateString(
                    "pt-BR",
                    {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    }
                  )}
                </p>
                <p className="text-sm text-blue-700">
                  Horário: {selectedSlot.time}
                </p>
              </div>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Paciente *
                </label>
                <select
                  value={patientType}
                  onChange={(e) => {
                    setPatientType(e.target.value as "convenio" | "private");
                    resetForm();
                  }}
                  className="input"
                  required
                >
                  <option value="convenio">Cliente do Convênio</option>
                  <option value="private">Paciente Particular</option>
                </select>
              </div>

              {patientType === "convenio" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Buscar por CPF *
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={formatCpf(searchCpf)}
                      onChange={(e) =>
                        setSearchCpf(e.target.value.replace(/\D/g, ""))
                      }
                      className="input flex-1"
                      placeholder="000.000.000-00"
                    />
                    <button
                      type="button"
                      onClick={searchByCpf}
                      className="btn btn-secondary"
                      disabled={isSearching || !searchCpf}
                    >
                      {isSearching ? "Buscando..." : "Buscar"}
                    </button>
                  </div>

                  {foundClient && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center mb-2">
                        <User className="h-4 w-4 text-green-600 mr-2" />
                        <span className="font-medium text-green-800">
                          Cliente: {foundClient.name}
                        </span>
                      </div>

                      {dependents.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Dependente (opcional)
                          </label>
                          <select
                            value={selectedDependentId || ""}
                            onChange={(e) =>
                              setSelectedDependentId(
                                e.target.value ? Number(e.target.value) : null
                              )
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

                  {foundDependent && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center">
                        <Users className="h-4 w-4 text-blue-600 mr-2" />
                        <div>
                          <span className="font-medium text-blue-800">
                            Dependente: {foundDependent.name}
                          </span>
                          <p className="text-sm text-blue-700">
                            Titular: {foundDependent.client_name}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {patientType === "private" && (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Paciente Particular *
                  </label>
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        value={privatePatientSearch}
                        onChange={(e) => {
                          setPrivatePatientSearch(e.target.value);
                          setShowPrivatePatientDropdown(true);
                        }}
                        onFocus={() => setShowPrivatePatientDropdown(true)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        placeholder="Digite o nome ou CPF do paciente..."
                        required={!formData.private_patient_id}
                      />
                    </div>

                    {showPrivatePatientDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {isLoadingPatients ? (
                          <div className="p-4 text-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600 mx-auto mb-2"></div>
                            <p className="text-xs text-gray-500">
                              Buscando pacientes...
                            </p>
                          </div>
                        ) : privatePatientSearch.trim() === "" ? (
                          <div className="p-4 text-center">
                            <p className="text-xs text-gray-500">
                              Digite para buscar pacientes
                            </p>
                          </div>
                        ) : privatePatients.length > 0 ? (
                          privatePatients.map((patient) => (
                            <button
                              key={patient.id}
                              type="button"
                              onClick={() =>
                                handlePrivatePatientSelect(patient)
                              }
                              className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                                formData.private_patient_id ===
                                patient.id.toString()
                                  ? "bg-blue-50"
                                  : ""
                              }`}
                            >
                              <div className="font-medium text-gray-900">
                                {patient.name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {patient.cpf
                                  ? formatCpf(patient.cpf)
                                  : "CPF não informado"}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="p-4 text-center">
                            <p className="text-sm text-gray-500">
                              Nenhum paciente encontrado
                            </p>
                            <div className="mt-3 flex justify-center">
                              <button
                                type="button"
                                onClick={openQuickPrivatePatientModal}
                                className="px-3 py-2 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                              >
                                Cadastrar Novo Paciente
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {formData.private_patient_id && (
                    <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200 flex items-center justify-between">
                      <div className="flex items-center">
                        <User className="h-4 w-4 text-green-600 mr-2" />
                        <span className="text-sm font-medium text-green-800">
                          {selectedPrivatePatient?.name || privatePatientSearch}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            private_patient_id: "",
                          }));
                          setPrivatePatientSearch("");
                          setSelectedPrivatePatient(null);
                        }}
                        className="text-green-600 hover:text-green-800"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

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
                      {service.category_name && ` (${service.category_name})`}
                    </option>
                  ))}
                </select>
              </div>

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
                      setFormData((prev) => ({
                        ...prev,
                        value: e.target.value,
                      }))
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
                      setFormData((prev) => ({
                        ...prev,
                        location_id: e.target.value,
                      }))
                    }
                    className="input"
                  >
                    <option value="">Selecione um local</option>
                    {attendanceLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name} {location.is_default && "(Padrão)"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observações
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="input min-h-[80px]"
                  placeholder="Observações sobre a consulta..."
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
                  isCreating ? "opacity-70 cursor-not-allowed" : ""
                }`}
                disabled={
                  isCreating ||
                  (patientType === "convenio" &&
                    !foundClient &&
                    !foundDependent) ||
                  (patientType === "private" && !formData.private_patient_id) ||
                  !formData.service_id ||
                  !formData.value
                }
              >
                {isCreating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Agendando...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    Agendar Consulta
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showQuickPrivatePatientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[95vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Cadastrar Novo Paciente Particular
              </h2>
              <button
                type="button"
                onClick={() => setShowQuickPrivatePatientModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome *
                  </label>
                  <input
                    type="text"
                    value={quickPatientForm.name}
                    onChange={(e) =>
                      setQuickPatientForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CPF
                  </label>
                  <input
                    type="text"
                    value={formatCpf(quickPatientForm.cpf)}
                    onChange={(e) =>
                      setQuickPatientForm((prev) => ({
                        ...prev,
                        cpf: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={quickPatientForm.email}
                    onChange={(e) =>
                      setQuickPatientForm((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Telefone
                  </label>
                  <input
                    type="text"
                    value={quickPatientForm.phone}
                    onChange={(e) =>
                      setQuickPatientForm((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data de Nascimento
                  </label>
                  <input
                    type="date"
                    value={quickPatientForm.birth_date}
                    onChange={(e) =>
                      setQuickPatientForm((prev) => ({
                        ...prev,
                        birth_date: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CEP
                  </label>
                  <input
                    type="text"
                    value={quickPatientForm.zip_code}
                    onChange={(e) =>
                      setQuickPatientForm((prev) => ({
                        ...prev,
                        zip_code: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Endereço
                  </label>
                  <input
                    type="text"
                    value={quickPatientForm.address}
                    onChange={(e) =>
                      setQuickPatientForm((prev) => ({
                        ...prev,
                        address: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Número
                  </label>
                  <input
                    type="text"
                    value={quickPatientForm.address_number}
                    onChange={(e) =>
                      setQuickPatientForm((prev) => ({
                        ...prev,
                        address_number: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Complemento
                  </label>
                  <input
                    type="text"
                    value={quickPatientForm.address_complement}
                    onChange={(e) =>
                      setQuickPatientForm((prev) => ({
                        ...prev,
                        address_complement: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bairro
                  </label>
                  <input
                    type="text"
                    value={quickPatientForm.neighborhood}
                    onChange={(e) =>
                      setQuickPatientForm((prev) => ({
                        ...prev,
                        neighborhood: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cidade
                  </label>
                  <input
                    type="text"
                    value={quickPatientForm.city}
                    onChange={(e) =>
                      setQuickPatientForm((prev) => ({
                        ...prev,
                        city: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estado
                  </label>
                  <input
                    type="text"
                    value={quickPatientForm.state}
                    onChange={(e) =>
                      setQuickPatientForm((prev) => ({
                        ...prev,
                        state: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickPrivatePatientModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  disabled={isSavingQuickPatient}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateQuickPrivatePatient}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  disabled={isSavingQuickPatient}
                >
                  {isSavingQuickPatient ? "Salvando..." : "Cadastrar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ScheduleConflictModal
        isOpen={showConflictModal}
        onClose={() => setShowConflictModal(false)}
        conflicts={conflictData}
        isSingleConflict={true}
      />
    </>
  );
};

export default QuickScheduleModal;
