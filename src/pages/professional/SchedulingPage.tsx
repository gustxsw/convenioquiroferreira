import React, { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  User,
  Plus,
  Check,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Users,
  Edit2,
  CheckCircle,
  XCircle,
  Search,
  MapPin,
} from "lucide-react";
import { format, addDays, subDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

type Consultation = {
  id: number;
  user_id: number | null;
  dependent_id: number | null;
  private_patient_id: number | null;
  professional_id: number;
  service_id: number;
  location_id: number | null;
  date: string;
  value: number;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  client_name: string;
  service_name: string;
  location_name: string | null;
  is_dependent: boolean;
  patient_type: "convenio" | "private";
  professional_percentage: number;
  amount_to_pay: number;
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
  subscription_status: string;
};

const SchedulingPage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [attendanceLocations, setAttendanceLocations] = useState<AttendanceLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // New consultation modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Status change modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [newStatus, setNewStatus] = useState<"scheduled" | "confirmed" | "completed" | "cancelled">("scheduled");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Client search state
  const [searchedClient, setSearchedClient] = useState<Client | null>(null);
  const [searchedDependents, setSearchedDependents] = useState<Dependent[]>([]);
  const [isSearchingClient, setIsSearchingClient] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    patient_type: "private" as "private" | "convenio",
    client_cpf: "",
    selected_dependent_id: "",
    private_patient_id: "",
    date: format(new Date(), "yyyy-MM-dd"),
    time: "",
    service_id: "",
    value: "",
    location_id: "",
    notes: "",
  });

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
  }, [selectedDate]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError("");

      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      console.log("🔄 Fetching consultations for date:", dateStr);

      // Fetch consultations for the professional on selected date
      const consultationsResponse = await fetch(
        `${apiUrl}/api/consultations/professional?date=${dateStr}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (consultationsResponse.ok) {
        const consultationsData = await consultationsResponse.json();
        console.log("✅ Consultations loaded:", consultationsData);
        setConsultations(consultationsData);
      } else {
        console.error("Consultations response error:", consultationsResponse.status);
        setConsultations([]);
      }

      // Fetch services
      const servicesResponse = await fetch(`${apiUrl}/api/services`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (servicesResponse.ok) {
        const servicesData = await servicesResponse.json();
        setServices(servicesData);
      } else {
        setServices([]);
      }

      // Fetch private patients
      const patientsResponse = await fetch(`${apiUrl}/api/private-patients`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (patientsResponse.ok) {
        const patientsData = await patientsResponse.json();
        setPrivatePatients(Array.isArray(patientsData) ? patientsData : []);
      } else {
        setPrivatePatients([]);
      }

      // Fetch attendance locations
      const locationsResponse = await fetch(`${apiUrl}/api/attendance-locations`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        setAttendanceLocations(locationsData);

        // Set default location if exists
        const defaultLocation = locationsData.find((loc: AttendanceLocation) => loc.is_default);
        if (defaultLocation) {
          setFormData((prev) => ({
            ...prev,
            location_id: defaultLocation.id.toString(),
          }));
        }
      } else {
        setAttendanceLocations([]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setError("Não foi possível carregar os dados da agenda");
    } finally {
      setIsLoading(false);
    }
  };

  const searchClientByCpf = async () => {
    if (!formData.client_cpf) return;

    try {
      setIsSearchingClient(true);
      setError("");
      
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const cleanCpf = formData.client_cpf.replace(/\D/g, "");

      // First try to find as dependent
      const dependentResponse = await fetch(
        `${apiUrl}/api/dependents/lookup?cpf=${cleanCpf}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (dependentResponse.ok) {
        const dependentData = await dependentResponse.json();
        
        if (dependentData.dependent_subscription_status !== "active") {
          setError("Este dependente não possui assinatura ativa");
          return;
        }

        // Set as dependent
        setSearchedClient({
          id: dependentData.client_id,
          name: dependentData.client_name,
          cpf: "",
          subscription_status: dependentData.dependent_subscription_status
        });
        setSearchedDependents([{
          id: dependentData.id,
          name: dependentData.name,
          cpf: dependentData.cpf,
          client_id: dependentData.client_id,
          client_name: dependentData.client_name,
          subscription_status: dependentData.dependent_subscription_status
        }]);
        setFormData(prev => ({ ...prev, selected_dependent_id: dependentData.id.toString() }));
        return;
      }

      // If not found as dependent, try as client
      const clientResponse = await fetch(
        `${apiUrl}/api/clients/lookup?cpf=${cleanCpf}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!clientResponse.ok) {
        throw new Error("Cliente não encontrado");
      }

      const clientData = await clientResponse.json();
      
      if (clientData.subscription_status !== "active") {
        setError("Este cliente não possui assinatura ativa");
        return;
      }

      setSearchedClient(clientData);

      // Fetch dependents
      const dependentsResponse = await fetch(
        `${apiUrl}/api/dependents/${clientData.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (dependentsResponse.ok) {
        const dependentsData = await dependentsResponse.json();
        setSearchedDependents(dependentsData.filter((d: any) => d.subscription_status === "active"));
      } else {
        setSearchedDependents([]);
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao buscar cliente");
      setSearchedClient(null);
      setSearchedDependents([]);
    } finally {
      setIsSearchingClient(false);
    }
  };

  const createConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      setIsCreating(true);
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      // Validate form
      if (formData.patient_type === "convenio") {
        if (!searchedClient) {
          setError("Busque um cliente válido primeiro");
          return;
        }
      } else {
        if (!formData.private_patient_id) {
          setError("Selecione um paciente particular");
          return;
        }
      }

      if (!formData.service_id || !formData.date || !formData.time || !formData.value) {
        setError("Preencha todos os campos obrigatórios");
        return;
      }

      // Combine date and time
      const consultationDateTime = new Date(`${formData.date}T${formData.time}`);

      const consultationData = {
        user_id: formData.patient_type === "convenio" && !formData.selected_dependent_id ? searchedClient?.id : null,
        dependent_id: formData.selected_dependent_id ? parseInt(formData.selected_dependent_id) : null,
        private_patient_id: formData.patient_type === "private" ? parseInt(formData.private_patient_id) : null,
        service_id: parseInt(formData.service_id),
        location_id: formData.location_id ? parseInt(formData.location_id) : null,
        value: parseFloat(formData.value),
        date: consultationDateTime.toISOString(),
        status: "scheduled",
        notes: formData.notes.trim() || null,
      };

      console.log("🔄 Creating consultation:", consultationData);

      const response = await fetch(`${apiUrl}/api/consultations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(consultationData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao criar agendamento");
      }

      setSuccess("Agendamento criado com sucesso!");
      await fetchData();
      setShowNewModal(false);
      resetForm();
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao criar agendamento");
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setFormData({
      patient_type: "private",
      client_cpf: "",
      selected_dependent_id: "",
      private_patient_id: "",
      date: format(selectedDate, "yyyy-MM-dd"),
      time: "",
      service_id: "",
      value: "",
      location_id: "",
      notes: "",
    });
    setSearchedClient(null);
    setSearchedDependents([]);
  };

  const openStatusModal = (consultation: Consultation) => {
    setSelectedConsultation(consultation);
    setNewStatus(consultation.status);
    setShowStatusModal(true);
  };

  const closeStatusModal = () => {
    setShowStatusModal(false);
    setSelectedConsultation(null);
    setError("");
  };

  const openEditModal = (consultation: Consultation) => {
    setSelectedConsultation(consultation);
    setFormData({
      patient_type: consultation.patient_type,
      client_cpf: "",
      selected_dependent_id: consultation.dependent_id?.toString() || "",
      private_patient_id: consultation.private_patient_id?.toString() || "",
      date: format(new Date(consultation.date), "yyyy-MM-dd"),
      time: format(new Date(consultation.date), "HH:mm"),
      service_id: consultation.service_id.toString(),
      value: consultation.value.toString(),
      location_id: consultation.location_id?.toString() || "",
      notes: consultation.notes || "",
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setSelectedConsultation(null);
    setError("");
    resetForm();
  };

  const updateConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConsultation) return;

    try {
      setIsEditing(true);
      setError("");

      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const consultationDateTime = new Date(`${formData.date}T${formData.time}`);

      const updateData = {
        service_id: parseInt(formData.service_id),
        location_id: formData.location_id ? parseInt(formData.location_id) : null,
        value: parseFloat(formData.value),
        date: consultationDateTime.toISOString(),
        notes: formData.notes.trim() || null,
      };

      const response = await fetch(
        `${apiUrl}/api/consultations/${selectedConsultation.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateData),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao atualizar consulta");
      }

      await fetchData();
      setShowEditModal(false);
      setSelectedConsultation(null);
      setSuccess("Consulta atualizada com sucesso!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao atualizar consulta");
    } finally {
      setIsEditing(false);
    }
  };

  const updateConsultationStatus = async () => {
    if (!selectedConsultation) return;

    try {
      setIsUpdatingStatus(true);
      setError("");

      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const response = await fetch(
        `${apiUrl}/api/consultations/${selectedConsultation.id}/status`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao atualizar status");
      }

      await fetchData();
      setShowStatusModal(false);
      setSelectedConsultation(null);
      setSuccess("Status atualizado com sucesso!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao atualizar status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const deleteConsultation = async (consultation: Consultation) => {
    if (!confirm("Tem certeza que deseja excluir esta consulta?")) return;

    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const response = await fetch(
        `${apiUrl}/api/consultations/${consultation.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao excluir consulta");
      }

      await fetchData();
      setSuccess("Consulta excluída com sucesso!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao excluir consulta");
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case "scheduled":
        return {
          text: "Agendado",
          className: "bg-blue-100 text-blue-800 border-blue-200",
          icon: <Clock className="h-3 w-3 mr-1" />,
        };
      case "confirmed":
        return {
          text: "Confirmado",
          className: "bg-green-100 text-green-800 border-green-200",
          icon: <CheckCircle className="h-3 w-3 mr-1" />,
        };
      case "completed":
        return {
          text: "Concluído",
          className: "bg-gray-100 text-gray-800 border-gray-200",
          icon: <Check className="h-3 w-3 mr-1" />,
        };
      case "cancelled":
        return {
          text: "Cancelado",
          className: "bg-red-100 text-red-800 border-red-200",
          icon: <XCircle className="h-3 w-3 mr-1" />,
        };
      default:
        return {
          text: "Desconhecido",
          className: "bg-gray-100 text-gray-800 border-gray-200",
          icon: <AlertCircle className="h-3 w-3 mr-1" />,
        };
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatCpf = (value: string) => {
    if (!value) return "";
    const numericValue = value.replace(/\D/g, "");
    return numericValue.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const serviceId = e.target.value;
    setFormData((prev) => ({ ...prev, service_id: serviceId }));

    // Auto-fill value based on service
    const service = services.find((s) => s.id.toString() === serviceId);
    if (service) {
      setFormData((prev) => ({
        ...prev,
        value: service.base_price.toString(),
      }));
    }
  };

  const generateTimeSlots = () => {
    const slots = [];
    for (let hour = 8; hour <= 18; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        slots.push(timeStr);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();
  const dailyConsultations = consultations.sort((a, b) => {
    const timeA = format(new Date(a.date), "HH:mm");
    const timeB = format(new Date(b.date), "HH:mm");
    return timeA.localeCompare(timeB);
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600">Visualize e gerencie seus agendamentos</p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="btn btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Nova Consulta
        </button>
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

      {/* Date Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedDate(subDays(selectedDate, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </h2>
            <p className="text-sm text-gray-600">
              {dailyConsultations.length} consulta(s) agendada(s)
            </p>
          </div>

          <button
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
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

      {/* Schedule Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando agenda...</p>
          </div>
        ) : (
          <div className="flex">
            {/* Time Column */}
            <div className="w-24 bg-gray-50 border-r border-gray-200">
              <div className="sticky top-0 bg-gray-100 p-3 border-b border-gray-200">
                <div className="text-xs font-medium text-gray-600 text-center">HORÁRIO</div>
              </div>
              <div className="space-y-0">
                {timeSlots.map((timeSlot) => (
                  <div
                    key={timeSlot}
                    className="h-20 flex items-center justify-center border-b border-gray-100 text-sm font-medium text-gray-700"
                  >
                    {timeSlot}
                  </div>
                ))}
              </div>
            </div>

            {/* Consultations Column */}
            <div className="flex-1">
              <div className="sticky top-0 bg-gray-100 p-3 border-b border-gray-200">
                <div className="text-xs font-medium text-gray-600 text-center">CONSULTAS</div>
              </div>
              <div className="relative">
                {timeSlots.map((timeSlot) => {
                  const consultation = dailyConsultations.find((cons) => {
                    const consultationTime = format(new Date(cons.date), "HH:mm");
                    return consultationTime === timeSlot;
                  });

                  return (
                    <div
                      key={timeSlot}
                      className="h-20 border-b border-gray-100 flex items-center px-4 hover:bg-gray-50 transition-colors"
                    >
                      {consultation ? (
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center space-x-3 flex-1">
                            <div className="flex-1">
                              <div className="flex items-center mb-1">
                                {consultation.patient_type === "convenio" ? (
                                  consultation.is_dependent ? (
                                    <Users className="h-4 w-4 text-blue-600 mr-2" />
                                  ) : (
                                    <User className="h-4 w-4 text-green-600 mr-2" />
                                  )
                                ) : (
                                  <User className="h-4 w-4 text-purple-600 mr-2" />
                                )}
                                <span className="font-medium text-gray-900 text-sm">
                                  {consultation.client_name}
                                </span>
                                {consultation.patient_type === "convenio" && (
                                  <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                                    Convênio
                                  </span>
                                )}
                                {consultation.patient_type === "private" && (
                                  <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                                    Particular
                                  </span>
                                )}
                                {consultation.is_dependent && (
                                  <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                    Dependente
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-4">
                                <p className="text-xs text-gray-600">{consultation.service_name}</p>
                                <p className="text-xs font-medium text-green-600">
                                  {formatCurrency(consultation.value)}
                                </p>
                                {consultation.patient_type === "convenio" && consultation.amount_to_pay > 0 && (
                                  <p className="text-xs text-red-600">
                                    Pagar: {formatCurrency(consultation.amount_to_pay)}
                                  </p>
                                )}
                              </div>
                              {consultation.location_name && (
                                <div className="flex items-center mt-1">
                                  <MapPin className="h-3 w-3 text-gray-400 mr-1" />
                                  <p className="text-xs text-gray-500">{consultation.location_name}</p>
                                </div>
                              )}
                              {consultation.notes && (
                                <p className="text-xs text-gray-500 mt-1 italic truncate">
                                  "{consultation.notes}"
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => openEditModal(consultation)}
                              className="p-1 text-blue-600 hover:text-blue-800"
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openStatusModal(consultation)}
                              className={`px-2 py-1 rounded text-xs font-medium flex items-center border transition-all hover:shadow-sm ${
                                getStatusInfo(consultation.status).className
                              }`}
                              title="Alterar status"
                            >
                              {getStatusInfo(consultation.status).icon}
                              {getStatusInfo(consultation.status).text}
                            </button>
                            <button
                              onClick={() => deleteConsultation(consultation)}
                              className="p-1 text-red-600 hover:text-red-800"
                              title="Excluir"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 italic">Horário livre</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Daily Statistics */}
      {dailyConsultations.length > 0 && (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg text-center border border-blue-200">
            <div className="text-2xl font-bold text-blue-600">
              {dailyConsultations.filter((c) => c.status === "scheduled").length}
            </div>
            <div className="text-sm text-blue-700 flex items-center justify-center">
              <Clock className="h-3 w-3 mr-1" />
              Agendados
            </div>
          </div>

          <div className="bg-green-50 p-4 rounded-lg text-center border border-green-200">
            <div className="text-2xl font-bold text-green-600">
              {dailyConsultations.filter((c) => c.status === "confirmed").length}
            </div>
            <div className="text-sm text-green-700 flex items-center justify-center">
              <CheckCircle className="h-3 w-3 mr-1" />
              Confirmados
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg text-center border border-gray-200">
            <div className="text-2xl font-bold text-gray-600">
              {dailyConsultations.filter((c) => c.status === "completed").length}
            </div>
            <div className="text-sm text-gray-700 flex items-center justify-center">
              <Check className="h-3 w-3 mr-1" />
              Concluídos
            </div>
          </div>

          <div className="bg-red-50 p-4 rounded-lg text-center border border-red-200">
            <div className="text-2xl font-bold text-red-600">
              {dailyConsultations.filter((c) => c.status === "cancelled").length}
            </div>
            <div className="text-sm text-red-700 flex items-center justify-center">
              <XCircle className="h-3 w-3 mr-1" />
              Cancelados
            </div>
          </div>

          <div className="bg-orange-50 p-4 rounded-lg text-center border border-orange-200">
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(
                dailyConsultations
                  .filter((c) => c.patient_type === "convenio")
                  .reduce((sum, c) => sum + c.amount_to_pay, 0)
              )}
            </div>
            <div className="text-sm text-orange-700">A Pagar</div>
          </div>
        </div>
      )}

      {/* New Consultation Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center">
                  <Plus className="h-6 w-6 text-red-600 mr-2" />
                  Nova Consulta
                </h2>
                <button
                  onClick={() => setShowNewModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-6 mt-4 bg-red-50 text-red-600 p-3 rounded-lg">
                {error}
              </div>
            )}

            <form onSubmit={createConsultation} className="p-6">
              <div className="space-y-6">
                {/* Patient Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Paciente *
                  </label>
                  <select
                    value={formData.patient_type}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        patient_type: e.target.value as "private" | "convenio",
                        client_cpf: "",
                        selected_dependent_id: "",
                        private_patient_id: "",
                      }));
                      setSearchedClient(null);
                      setSearchedDependents([]);
                    }}
                    className="input"
                    required
                  >
                    <option value="private">Paciente Particular</option>
                    <option value="convenio">Cliente do Convênio</option>
                  </select>
                </div>

                {/* Convenio Patient Search */}
                {formData.patient_type === "convenio" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CPF do Cliente *
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={formatCpf(formData.client_cpf)}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            client_cpf: e.target.value.replace(/\D/g, ""),
                          }))
                        }
                        className="input flex-1"
                        placeholder="000.000.000-00"
                        required
                      />
                      <button
                        type="button"
                        onClick={searchClientByCpf}
                        className="btn btn-secondary flex items-center"
                        disabled={isSearchingClient || !formData.client_cpf}
                      >
                        {isSearchingClient ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* Client found */}
                    {searchedClient && (
                      <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center mb-2">
                          <User className="h-4 w-4 text-green-600 mr-2" />
                          <span className="font-medium text-green-800">{searchedClient.name}</span>
                          <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                            Assinatura Ativa
                          </span>
                        </div>

                        {/* Dependent selection */}
                        {searchedDependents.length > 0 && (
                          <div className="mt-3">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Selecionar Dependente (opcional)
                            </label>
                            <select
                              value={formData.selected_dependent_id}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  selected_dependent_id: e.target.value,
                                }))
                              }
                              className="input"
                            >
                              <option value="">Consulta para o titular</option>
                              {searchedDependents.map((dependent) => (
                                <option key={dependent.id} value={dependent.id}>
                                  {dependent.name} - {formatCpf(dependent.cpf)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Private Patient Selection */}
                {formData.patient_type === "private" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Paciente Particular *
                    </label>
                    <select
                      value={formData.private_patient_id}
                      onChange={(e) =>
                        setFormData((prev) => ({
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
                          {patient.name} - {patient.cpf ? formatCpf(patient.cpf) : "CPF não informado"}
                        </option>
                      ))}
                    </select>
                    {privatePatients.length === 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        Nenhum paciente particular cadastrado. Cadastre pacientes na seção "Pacientes Particulares".
                      </p>
                    )}
                  </div>
                )}

                {/* Date and Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data *
                    </label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          date: e.target.value,
                        }))
                      }
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Horário *
                    </label>
                    <select
                      value={formData.time}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          time: e.target.value,
                        }))
                      }
                      className="input"
                      required
                    >
                      <option value="">Selecione um horário</option>
                      {timeSlots.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Service and Value */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Local de Atendimento
                  </label>
                  <select
                    value={formData.location_id || ""}
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

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observações
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    className="input min-h-[80px]"
                    placeholder="Observações sobre a consulta..."
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
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
                  disabled={isCreating}
                >
                  {isCreating ? "Criando..." : "Agendar Consulta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Change Modal */}
      {showStatusModal && selectedConsultation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center">
                  <Edit2 className="h-6 w-6 text-blue-600 mr-2" />
                  Alterar Status
                </h2>
                <button
                  onClick={closeStatusModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Consultation info */}
              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <div className="flex items-center mb-2">
                  {selectedConsultation.patient_type === "convenio" ? (
                    selectedConsultation.is_dependent ? (
                      <Users className="h-4 w-4 text-blue-600 mr-2" />
                    ) : (
                      <User className="h-4 w-4 text-green-600 mr-2" />
                    )
                  ) : (
                    <User className="h-4 w-4 text-purple-600 mr-2" />
                  )}
                  <span className="font-medium">{selectedConsultation.client_name}</span>
                </div>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Serviço:</strong> {selectedConsultation.service_name}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Data/Hora:</strong> {format(new Date(selectedConsultation.date), "dd/MM/yyyy 'às' HH:mm")}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Valor:</strong> {formatCurrency(selectedConsultation.value)}
                </p>
              </div>

              {/* Status selection */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Selecione o novo status:
                </label>

                <div className="space-y-2">
                  {[
                    { value: "scheduled", label: "Agendado", icon: Clock, color: "blue" },
                    { value: "confirmed", label: "Confirmado", icon: CheckCircle, color: "green" },
                    { value: "completed", label: "Concluído", icon: Check, color: "gray" },
                    { value: "cancelled", label: "Cancelado", icon: XCircle, color: "red" },
                  ].map((statusOption) => {
                    const IconComponent = statusOption.icon;
                    return (
                      <label
                        key={statusOption.value}
                        className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                          newStatus === statusOption.value
                            ? `border-${statusOption.color}-300 bg-${statusOption.color}-50`
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="status"
                          value={statusOption.value}
                          checked={newStatus === statusOption.value}
                          onChange={(e) => setNewStatus(e.target.value as any)}
                          className={`text-${statusOption.color}-600 focus:ring-${statusOption.color}-500`}
                        />
                        <div className="ml-3 flex items-center">
                          <IconComponent className={`h-4 w-4 text-${statusOption.color}-600 mr-2`} />
                          <div className="font-medium text-gray-900">{statusOption.label}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={closeStatusModal}
                  className="btn btn-secondary"
                  disabled={isUpdatingStatus}
                >
                  Cancelar
                </button>
                <button
                  onClick={updateConsultationStatus}
                  className={`btn btn-primary ${
                    isUpdatingStatus ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                  disabled={isUpdatingStatus || newStatus === selectedConsultation.status}
                >
                  {isUpdatingStatus ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Atualizando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Atualizar Status
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Consultation Modal */}
      {showEditModal && selectedConsultation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center">
                  <Edit2 className="h-6 w-6 text-blue-600 mr-2" />
                  Editar Consulta
                </h2>
                <button
                  onClick={closeEditModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <form onSubmit={updateConsultation} className="p-6">
              <div className="space-y-6">
                {/* Patient info (read-only) */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center">
                    {selectedConsultation.patient_type === "convenio" ? (
                      selectedConsultation.is_dependent ? (
                        <Users className="h-4 w-4 text-blue-600 mr-2" />
                      ) : (
                        <User className="h-4 w-4 text-green-600 mr-2" />
                      )
                    ) : (
                      <User className="h-4 w-4 text-purple-600 mr-2" />
                    )}
                    <span className="font-medium">{selectedConsultation.client_name}</span>
                    <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                      selectedConsultation.patient_type === "convenio" 
                        ? "bg-green-100 text-green-800" 
                        : "bg-purple-100 text-purple-800"
                    }`}>
                      {selectedConsultation.patient_type === "convenio" ? "Convênio" : "Particular"}
                    </span>
                  </div>
                </div>

                {/* Date and Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data *
                    </label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          date: e.target.value,
                        }))
                      }
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Horário *
                    </label>
                    <select
                      value={formData.time}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          time: e.target.value,
                        }))
                      }
                      className="input"
                      required
                    >
                      <option value="">Selecione um horário</option>
                      {timeSlots.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Service and Value */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Local de Atendimento
                  </label>
                  <select
                    value={formData.location_id || ""}
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

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Observações
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    className="input min-h-[80px]"
                    placeholder="Observações sobre a consulta..."
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="btn btn-secondary"
                  disabled={isEditing}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`btn btn-primary ${
                    isEditing ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                  disabled={isEditing}
                >
                  {isEditing ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchedulingPage;