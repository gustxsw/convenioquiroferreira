import type React from "react";
import { useState, useEffect, useRef } from "react";
import { Repeat, X, AlertCircle, User, Search } from "lucide-react";
import TimeInput from "./TimeInput";
import { getCurrentDateString } from "../utils/dateHelpers";
import { fetchWithAuth, getApiUrl } from "../utils/apiHelpers";
import ScheduleConflictModal from "./ScheduleConflictModal";

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

type Client = {
  id: number;
  name: string;
  subscription_status: string;
};

type Dependent = {
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
  // Data states
  const [services, setServices] = useState<Service[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [attendanceLocations, setAttendanceLocations] = useState<
    AttendanceLocation[]
  >([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState<
    Array<{
      date: string;
      time: string;
      clientName: string;
    }>
  >([]);

  // Form state
  const [patientType, setPatientType] = useState<"convenio" | "private">(
    "private"
  );
  const [clientCpf, setClientCpf] = useState("");
  const [privatePatientId, setPrivatePatientId] = useState("");
  const [privatePatientSearch, setPrivatePatientSearch] = useState("");
  const [showPrivatePatientDropdown, setShowPrivatePatientDropdown] =
    useState(false);
  const privatePatientDropdownRef = useRef<HTMLDivElement>(null);
  const [serviceId, setServiceId] = useState("");
  const [value, setValue] = useState("");
  const [locationId, setLocationId] = useState("");
  const [startDate, setStartDate] = useState(getCurrentDateString());
  const [startTime, setStartTime] = useState("");
  const [recurrenceType, setRecurrenceType] = useState<
    "daily" | "weekly" | "monthly"
  >("weekly");
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [weeklyCount, setWeeklyCount] = useState(4);
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [occurrences, setOccurrences] = useState(10);
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  // Client search state
  const [clientSearchResult, setClientSearchResult] = useState<Client | null>(
    null
  );
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [selectedDependentId, setSelectedDependentId] = useState<number | null>(
    null
  );
  const [isSearching, setIsSearching] = useState(false);

  // Adicione este useEffect para filtrar pacientes particulares
  // Filter private patients based on search
  const filteredPrivatePatients = privatePatientSearch.trim() === ""
    ? privatePatients
    : privatePatients.filter((patient) => {
        const searchLower = privatePatientSearch.toLowerCase();
        return (
          patient.name.toLowerCase().includes(searchLower) ||
          (patient.cpf && patient.cpf.includes(searchLower.replace(/\D/g, "")))
        );
      });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        privatePatientDropdownRef.current &&
        !privatePatientDropdownRef.current.contains(event.target as Node)
      ) {
        setShowPrivatePatientDropdown(false);
      }
    };

    if (showPrivatePatientDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPrivatePatientDropdown]);

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

      const patientsResponse = await fetchWithAuth(`${apiUrl}/api/private-patients`);

      if (patientsResponse.ok) {
        const patientsData = await patientsResponse.json();
        setPrivatePatients(Array.isArray(patientsData) ? patientsData : []);
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
          setLocationId(defaultLocation.id.toString());
        }
      }
    } catch (error) {
      console.error("❌ [RECURRING-MODAL] Error fetching data:", error);
      setError("Não foi possível carregar os dados necessários");
    }
  };

  const resetForm = () => {
    setPatientType("private");
    setClientCpf("");
    setPrivatePatientId("");
    setPrivatePatientSearch("");
    setShowPrivatePatientDropdown(false);
    setServiceId("");
    setValue("");
    setStartDate(getCurrentDateString());
    setStartTime("");
    setRecurrenceType("weekly");
    setSelectedWeekdays([]);
    setWeeklyCount(4);
    setRecurrenceInterval(1);
    setOccurrences(10);
    setEndDate("");
    setNotes("");
    setClientSearchResult(null);
    setDependents([]);
    setSelectedDependentId(null);
    setError("");
    setSuccess("");
    setShowConflictModal(false);
    setConflictData([]);
  };

  const searchClientByCpf = async () => {
    if (!clientCpf) return;

    try {
      setIsSearching(true);
      setError("");

      const apiUrl = getApiUrl();
      const cleanCpf = clientCpf.replace(/\D/g, "");


      const clientResponse = await fetchWithAuth(
        `${apiUrl}/api/clients/lookup?cpf=${cleanCpf}`
      );

      if (clientResponse.ok) {
        const clientData = await clientResponse.json();

        if (clientData.subscription_status !== "active") {
          setError("Cliente não possui assinatura ativa");
          return;
        }

        setClientSearchResult(clientData);

        const dependentsResponse = await fetchWithAuth(
          `${apiUrl}/api/dependents?client_id=${clientData.id}&status=active`
        );

        if (dependentsResponse.ok) {
          const dependentsData = await dependentsResponse.json();
          setDependents(dependentsData);
        }
      } else {
        const dependentResponse = await fetchWithAuth(
          `${apiUrl}/api/dependents/search?cpf=${cleanCpf}`
        );

        if (dependentResponse.ok) {
          const dependentData = await dependentResponse.json();

          if (dependentData.status !== "active") {
            setError("Dependente não possui status ativo");
            return;
          }

          setClientSearchResult({
            id: dependentData.user_id,
            name: dependentData.client_name,
            subscription_status: "active",
          });
          setSelectedDependentId(dependentData.id);
          setDependents([]);
        } else {
          setError("Cliente ou dependente não encontrado");
        }
      }
    } catch (error) {
      console.error("❌ [RECURRING-MODAL] Error searching client:", error);
      setError("Erro ao buscar cliente");
    } finally {
      setIsSearching(false);
    }
  };

  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedServiceId = e.target.value;
    setServiceId(selectedServiceId);

    const service = services.find((s) => s.id.toString() === selectedServiceId);
    if (service) {
      setValue(service.base_price.toString());
    }
  };

  const handleWeekdayToggle = (dayValue: number) => {
    setSelectedWeekdays((prev) => {
      if (prev.includes(dayValue)) {
        return prev.filter((d) => d !== dayValue);
      } else {
        return [...prev, dayValue];
      }
    });
  };

  const handlePrivatePatientSelect = (patient: PrivatePatient) => {
    // Declare handlePrivatePatientSelect
    setPrivatePatientId(patient.id.toString());
    setPrivatePatientSearch("");
    setShowPrivatePatientDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setShowConflictModal(false);
    setConflictData([]);


    // Validation
    if (patientType === "convenio" && !clientSearchResult) {
      setError("Busque e selecione um cliente ou dependente");
      return;
    }

    if (patientType === "private" && !privatePatientId) {
      setError("Selecione um paciente particular");
      return;
    }

    if (!serviceId || !value || !startDate || !startTime) {
      setError("Preencha todos os campos obrigatórios");
      return;
    }

    if (recurrenceType === "daily" && selectedWeekdays.length === 0) {
      setError(
        "Para recorrência diária, selecione pelo menos um dia da semana"
      );
      return;
    }

    try {
      setIsCreating(true);
      const apiUrl = getApiUrl();

      const consultationData: any = {
        service_id: Number.parseInt(serviceId),
        location_id: locationId ? Number.parseInt(locationId) : null,
        value: Number.parseFloat(value),
        start_date: startDate,
        start_time: startTime,
        recurrence_type: recurrenceType,
        recurrence_interval:
          recurrenceType === "weekly" ? 1 : recurrenceInterval,
        weekly_count: recurrenceType === "weekly" ? weeklyCount : null,
        selected_weekdays: recurrenceType === "daily" ? selectedWeekdays : [],
        occurrences: occurrences,
        notes: notes.trim() || null,
      };

      if (patientType === "private") {
        consultationData.private_patient_id = Number.parseInt(privatePatientId);
      } else {
        if (selectedDependentId) {
          consultationData.dependent_id = selectedDependentId;
        } else {
          consultationData.user_id = clientSearchResult?.id;
        }
      }


      const response = await fetchWithAuth(`${apiUrl}/api/consultations/recurring`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(consultationData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (
          response.status === 409 &&
          errorData.conflict &&
          errorData.conflicts
        ) {
          setConflictData(errorData.conflicts);
          setShowConflictModal(true);
          setError("");
        } else {
          setError(errorData.message || "Falha ao criar consultas recorrentes");
        }
        return;
      }

      const result = await response.json();

      onSuccess();
      onClose();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Erro ao criar consultas recorrentes"
      );
    } finally {
      setIsCreating(false);
    }
  };

  const formatCpf = (value: string) => {
    if (!value) return "";
    const numericValue = value.replace(/\D/g, "");
    return numericValue.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  const weekdays = [
    { value: 1, label: "Segunda", short: "SEG" },
    { value: 2, label: "Terça", short: "TER" },
    { value: 3, label: "Quarta", short: "QUA" },
    { value: 4, label: "Quinta", short: "QUI" },
    { value: 5, label: "Sexta", short: "SEX" },
    { value: 6, label: "Sábado", short: "SÁB" },
    { value: 0, label: "Domingo", short: "DOM" },
  ];

  const weeklyOptions = [
    { value: 1, label: "1 semana" },
    { value: 2, label: "2 semanas" },
    { value: 3, label: "3 semanas" },
    { value: 4, label: "4 semanas" },
    { value: 6, label: "6 semanas" },
    { value: 8, label: "8 semanas" },
    { value: 12, label: "12 semanas" },
    { value: 24, label: "24 semanas" },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
          {/* Header */}
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

          {/* Error Message */}
          {error && (
            <div className="mx-6 mt-4 bg-red-50 text-red-600 p-3 rounded-lg flex items-center">
              <AlertCircle className="h-5 w-5 mr-2" />
              {error}
            </div>
          )}

          {success && (
            <div className="mx-6 mt-4 bg-yellow-50 text-yellow-800 p-3 rounded-lg flex items-center">
              <AlertCircle className="h-5 w-5 mr-2" />
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-6">
              {/* Patient Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Paciente
                </label>
                <select
                  value={patientType}
                  onChange={(e) => {
                    setPatientType(e.target.value as "convenio" | "private");
                    setClientCpf("");
                    setPrivatePatientId("");
                    setPrivatePatientSearch("");
                    setShowPrivatePatientDropdown(false);
                    setClientSearchResult(null);
                    setDependents([]);
                    setSelectedDependentId(null);
                  }}
                  className="input"
                  required
                >
                  <option value="private">Paciente Particular</option>
                  <option value="convenio">Cliente do Convênio</option>
                </select>
              </div>

              {/* Private Patient Selection */}
              {patientType === "private" && (
                <div className="relative" ref={privatePatientDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Paciente Particular
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
                        required={!privatePatientId}
                      />
                    </div>

                    {showPrivatePatientDropdown && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {isLoadingPatients ? (
                          <div className="p-4 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 mx-auto mb-2"></div>
                            <p className="text-sm text-gray-500">
                              Carregando pacientes...
                            </p>
                          </div>
                        ) : filteredPrivatePatients.length > 0 ? (
                          filteredPrivatePatients.map((patient) => (
                            <button
                              key={patient.id}
                              type="button"
                              onClick={() =>
                                handlePrivatePatientSelect(patient)
                              }
                              className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                                privatePatientId === patient.id.toString()
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
                            <p className="text-sm text-gray-500 mb-2">
                              {privatePatients.length === 0
                                ? "Nenhum paciente particular cadastrado"
                                : "Nenhum paciente encontrado com esse termo"}
                            </p>
                            {privatePatients.length === 0 && (
                              <p className="text-xs text-gray-400">
                                Cadastre pacientes na página "Pacientes Particulares"
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {privatePatientId && (
                    <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200 flex items-center justify-between">
                      <div className="flex items-center">
                        <User className="h-4 w-4 text-green-600 mr-2" />
                        <span className="text-sm font-medium text-green-800">
                          {
                            privatePatients.find(
                              (p) => p.id.toString() === privatePatientId
                            )?.name
                          }
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPrivatePatientId("");
                          setPrivatePatientSearch("");
                        }}
                        className="text-green-600 hover:text-green-800"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Convenio Client Search */}
              {patientType === "convenio" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CPF do Cliente
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={formatCpf(clientCpf)}
                      onChange={(e) =>
                        setClientCpf(e.target.value.replace(/\D/g, ""))
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
                      {isSearching ? "Buscando..." : "Buscar"}
                    </button>
                  </div>

                  {/* Client Search Result */}
                  {clientSearchResult && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center mb-2">
                        <User className="h-4 w-4 text-green-600 mr-2" />
                        <span className="font-medium text-green-800">
                          Cliente: {clientSearchResult.name}
                        </span>
                      </div>

                      {/* Dependent Selection */}
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
                </div>
              )}

              {/* Service Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Serviço
                </label>
                <select
                  value={serviceId}
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
                    Valor
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="input"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Local de Atendimento
                  </label>
                  <select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    className="input"
                  >
                    <option value="">Selecione um local</option>
                    {attendanceLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Maximum Occurrences Only */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número de Consultas
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={occurrences}
                  onChange={(e) =>
                    setOccurrences(Number.parseInt(e.target.value))
                  }
                  className="input"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Quantas consultas você quer criar no total
                </p>
              </div>

              {/* Start Date and Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data de Início
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input"
                    required
                  />
                </div>

                <TimeInput
                  value={startTime}
                  onChange={setStartTime}
                  label="Horário"
                  required
                />
              </div>

              {/* Recurrence Settings */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Configurações de Recorrência
                </h3>

                {/* Recurrence Type */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Recorrência
                  </label>
                  <select
                    value={recurrenceType}
                    onChange={(e) => {
                      const newType = e.target.value as
                        | "daily"
                        | "weekly"
                        | "monthly";
                      setRecurrenceType(newType);
                      if (newType !== "daily") {
                        setSelectedWeekdays([]);
                      }
                      if (newType !== "weekly") {
                        setWeeklyCount(4);
                      }
                    }}
                    className="input"
                    required
                  >
                    <option value="daily">Diário</option>
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensal</option>
                  </select>
                </div>

                {/* Daily Recurrence - Weekday Selection */}
                {recurrenceType === "daily" && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Selecione os dias da semana
                    </label>
                    <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
                      {weekdays.map((day) => {
                        const isSelected = selectedWeekdays.includes(day.value);
                        return (
                          <label
                            key={day.value}
                            className={`flex flex-col items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${
                              isSelected
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleWeekdayToggle(day.value)}
                              className="sr-only"
                            />
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${
                                isSelected
                                  ? "bg-blue-500 text-white"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              <span className="text-xs font-bold">
                                {day.short.charAt(0)}
                              </span>
                            </div>
                            <span className="text-xs font-medium">
                              {day.short}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    {selectedWeekdays.length === 0 && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-600 font-medium">
                          Selecione pelo menos um dia da semana
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Weekly Recurrence - Number of Weeks */}
                {recurrenceType === "weekly" && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Quantas semanas seguidas?
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {weeklyOptions.map((option) => {
                        const isSelected = weeklyCount === option.value;
                        return (
                          <label
                            key={option.value}
                            className={`flex flex-col items-center p-4 rounded-xl border-2 cursor-pointer transition-all ${
                              isSelected
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            <input
                              type="radio"
                              name="weekly_count"
                              value={option.value}
                              checked={isSelected}
                              onChange={(e) =>
                                setWeeklyCount(Number.parseInt(e.target.value))
                              }
                              className="sr-only"
                            />
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                                isSelected
                                  ? "bg-blue-500 text-white"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              <span className="text-sm font-bold">
                                {option.value}
                              </span>
                            </div>
                            <span className="text-xs font-medium text-center">
                              {option.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Monthly Recurrence Interval */}
                {recurrenceType === "monthly" && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      A cada quantos meses?
                    </label>
                    <select
                      value={recurrenceInterval}
                      onChange={(e) =>
                        setRecurrenceInterval(Number.parseInt(e.target.value))
                      }
                      className="input"
                      required
                    >
                      <option value={1}>Todo mês</option>
                      <option value={2}>A cada 2 meses</option>
                      <option value={3}>A cada 3 meses</option>
                      <option value={6}>A cada 6 meses</option>
                      <option value={12}>A cada 12 meses (anual)</option>
                    </select>
                  </div>
                )}

                {/* Preview */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h4 className="font-medium text-blue-900 mb-3">
                    Resumo da Recorrência:
                  </h4>
                  <div className="text-sm text-blue-700 space-y-2">
                    {recurrenceType === "daily" &&
                      selectedWeekdays.length > 0 && (
                        <div>
                          <p className="font-medium">
                            Consultas nos dias:{" "}
                            {weekdays
                              .filter((day) =>
                                selectedWeekdays.includes(day.value)
                              )
                              .map((day) => day.label)
                              .join(", ")}
                          </p>
                          <p>
                            Estimativa: {selectedWeekdays.length} consulta(s)
                            por semana
                          </p>
                        </div>
                      )}
                    {recurrenceType === "weekly" && (
                      <div>
                        <p className="font-medium">
                          Consultas semanais por {weeklyCount} semana(s)
                        </p>
                        <p>Total: {weeklyCount} consulta(s)</p>
                      </div>
                    )}
                    {recurrenceType === "monthly" && (
                      <div>
                        <p className="font-medium">
                          Consultas mensais a cada {recurrenceInterval} mês(es)
                        </p>
                        <p>Máximo: {occurrences} consultas</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observações
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input min-h-[80px]"
                  placeholder="Observações sobre as consultas..."
                />
              </div>
            </div>

            {/* Action Buttons */}
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
                  (patientType === "convenio" && !clientSearchResult) ||
                  (patientType === "private" && !privatePatientId) ||
                  !serviceId ||
                  !value ||
                  !startDate ||
                  !startTime ||
                  (recurrenceType === "daily" && selectedWeekdays.length === 0)
                }
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

      <ScheduleConflictModal
        isOpen={showConflictModal}
        onClose={() => setShowConflictModal(false)}
        conflicts={conflictData}
        isSingleConflict={false}
      />
    </>
  );
};

export default RecurringConsultationModal;
