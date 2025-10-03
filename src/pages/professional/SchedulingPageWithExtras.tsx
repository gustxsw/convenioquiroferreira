"use client";

import type React from "react";
import { useState, useEffect } from "react";
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
  CheckCircle,
  XCircle,
  DollarSign,
  Edit,
  MessageCircle,
  Repeat,
  MapPin,
} from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import EditConsultationModal from "../../components/EditConsultationModal";
import RecurringConsultationModal from "../../components/RecurringConsultationModal";

type Consultation = {
  id: number;
  date: string;
  client_name: string;
  service_name: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
  value: number;
  notes?: string;
  is_dependent: boolean;
  patient_type: "convenio" | "private";
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

const SchedulingPageWithExtras: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [attendanceLocations, setAttendanceLocations] = useState<
    AttendanceLocation[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // New consultation modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Status change modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedConsultation, setSelectedConsultation] =
    useState<Consultation | null>(null);
  const [newStatus, setNewStatus] = useState<
    "scheduled" | "confirmed" | "completed" | "cancelled"
  >("scheduled");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Edit consultation modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [consultationToEdit, setConsultationToEdit] =
    useState<Consultation | null>(null);

  // Recurring consultation modal
  const [showRecurringModal, setShowRecurringModal] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    patient_type: "private" as "convenio" | "private",
    client_cpf: "",
    private_patient_id: "",
    date: format(new Date(), "yyyy-MM-dd"),
    time: "",
    service_id: "",
    value: "",
    location_id: "",
    notes: "",
    is_recurring: false,
    recurrence_type: "weekly" as "daily" | "weekly",
    recurrence_interval: 1,
    occurrences: 4,
  });

  // Client search state
  const [clientSearchResult, setClientSearchResult] = useState<any>(null);
  const [dependents, setDependents] = useState<any[]>([]);
  const [selectedDependentId, setSelectedDependentId] = useState<number | null>(
    null
  );
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

      // Fetch consultations for the selected date
      const consultationsResponse = await fetch(
        `${apiUrl}/api/consultations/agenda?date=${dateStr}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (consultationsResponse.ok) {
        const consultationsData = await consultationsResponse.json();
        console.log("✅ Consultations loaded:", consultationsData.length);
        setConsultations(consultationsData);
      } else {
        console.error(
          "Consultations response error:",
          consultationsResponse.status
        );
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
      }

      // Fetch attendance locations
      const locationsResponse = await fetch(
        `${apiUrl}/api/attendance-locations`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        setAttendanceLocations(locationsData);

        // Set default location if exists
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
      setError("Não foi possível carregar os dados da agenda");
    } finally {
      setIsLoading(false);
    }
  };

  const searchClientByCpf = async () => {
    if (!formData.client_cpf) return;

    try {
      setIsSearching(true);
      setError("");

      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const cleanCpf = formData.client_cpf.replace(/\D/g, "");

      // Search for client
      const clientResponse = await fetch(
        `${apiUrl}/api/clients/lookup?cpf=${cleanCpf}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (clientResponse.ok) {
        const clientData = await clientResponse.json();

        if (clientData.subscription_status !== "active") {
          setError("Cliente não possui assinatura ativa");
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
          setDependents(
            dependentsData.filter(
              (d: any) => d.subscription_status === "active"
            )
          );
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

          if (dependentData.dependent_subscription_status !== "active") {
            setError("Dependente não possui assinatura ativa");
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
      setError("Erro ao buscar cliente");
    } finally {
      setIsSearching(false);
    }
  };

  const createConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      setIsCreating(true);
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      if (formData.is_recurring) {
        // Create recurring consultations
        const recurringData: any = {
          service_id: Number.parseInt(formData.service_id),
          location_id: formData.location_id
            ? Number.parseInt(formData.location_id)
            : null,
          value: Number.parseFloat(formData.value),
          start_date: formData.date,
          start_time: formData.time,
          recurrence_type: formData.recurrence_type,
          recurrence_interval: formData.recurrence_interval,
          occurrences: formData.occurrences,
          notes: formData.notes || null,
        };

        // Set patient based on type
        if (formData.patient_type === "private") {
          recurringData.private_patient_id = Number.parseInt(
            formData.private_patient_id
          );
        } else {
          if (selectedDependentId) {
            recurringData.dependent_id = selectedDependentId;
          } else {
            recurringData.user_id = clientSearchResult?.id;
          }
        }

        const response = await fetch(`${apiUrl}/api/consultations/recurring`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(recurringData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || "Falha ao criar consultas recorrentes"
          );
        }

        const result = await response.json();
        setSuccess(
          `${result.created_count} consultas recorrentes criadas com sucesso!`
        );
      } else {
        // Create single consultation
        const consultationData: any = {
          service_id: Number.parseInt(formData.service_id),
          location_id: formData.location_id
            ? Number.parseInt(formData.location_id)
            : null,
          value: Number.parseFloat(formData.value),
          date: new Date(`${formData.date}T${formData.time}`).toISOString(),
          status: "scheduled",
          notes: formData.notes || null,
        };

        // Set patient based on type
        if (formData.patient_type === "private") {
          consultationData.private_patient_id = Number.parseInt(
            formData.private_patient_id
          );
        } else {
          if (selectedDependentId) {
            consultationData.dependent_id = selectedDependentId;
          } else {
            consultationData.user_id = clientSearchResult?.id;
          }
        }

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
          throw new Error(errorData.message || "Falha ao criar consulta");
        }

        setSuccess("Consulta criada com sucesso!");
      }

      await fetchData();
      setShowNewModal(false);
      resetForm();
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Erro ao criar consulta"
      );
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setFormData({
      patient_type: "private",
      client_cpf: "",
      private_patient_id: "",
      date: format(selectedDate, "yyyy-MM-dd"),
      time: "",
      service_id: "",
      value: "",
      location_id: "",
      notes: "",
      is_recurring: false,
      recurrence_type: "weekly",
      recurrence_interval: 1,
      occurrences: 4,
    });
    setClientSearchResult(null);
    setDependents([]);
    setSelectedDependentId(null);
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
      setError(
        error instanceof Error ? error.message : "Erro ao atualizar status"
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const openEditModal = (consultation: Consultation) => {
    setConsultationToEdit(consultation);
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setConsultationToEdit(null);
  };

  const handleEditSuccess = () => {
    fetchData();
    setSuccess("Consulta editada com sucesso!");
    setTimeout(() => setSuccess(""), 3000);
  };

  const openWhatsApp = async (consultation: Consultation) => {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const response = await fetch(
        `${apiUrl}/api/consultations/${consultation.id}/whatsapp`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error("Erro ao gerar link do WhatsApp");
      }

      const data = await response.json();
      window.open(data.whatsapp_url, "_blank");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Erro ao abrir WhatsApp"
      );
      setTimeout(() => setError(""), 3000);
    }
  };

  const formatTime = (dateString: string) => {
    // Convert UTC date to Brasília timezone for display
    const utcDate = new Date(dateString);
    const brasiliaOffset = -3 * 60; // -3 hours in minutes
    const brasiliaDate = new Date(
      utcDate.getTime() + brasiliaOffset * 60 * 1000
    );

    return format(brasiliaDate, "HH:mm");
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
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute
          .toString()
          .padStart(2, "0")}`;
        slots.push(timeStr);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Group consultations by time for display
  const consultationsByTime = consultations.reduce((acc, consultation) => {
    const time = format(new Date(consultation.date), "HH:mm");
    acc[time] = consultation;
    return acc;
  }, {} as Record<string, Consultation>);

  // Calculate daily statistics
  const dailyStats = {
    scheduled: consultations.filter((c) => c.status === "scheduled").length,
    confirmed: consultations.filter((c) => c.status === "confirmed").length,
    completed: consultations.filter((c) => c.status === "completed").length,
    cancelled: consultations.filter((c) => c.status === "cancelled").length,
    totalValue: consultations.reduce((sum, c) => sum + c.value, 0),
    convenioValue: consultations
      .filter((c) => c.patient_type === "convenio")
      .reduce((sum, c) => sum + c.value * 0.5, 0), // Assuming 50% to pay to convenio
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600">Visualize e gerencie suas consultas</p>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setShowRecurringModal(true)}
            className="btn btn-outline flex items-center"
          >
            <Repeat className="h-5 w-5 mr-2" />
            Consultas Recorrentes
          </button>

          <button
            onClick={() => setShowNewModal(true)}
            className="btn btn-primary flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nova Consulta
          </button>
        </div>
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
              {consultations.length} consulta(s)
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

      {/* Daily Statistics */}
      {consultations.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg text-center border border-blue-200">
            <div className="text-2xl font-bold text-blue-600">
              {dailyStats.scheduled}
            </div>
            <div className="text-sm text-blue-700 flex items-center justify-center">
              <Clock className="h-3 w-3 mr-1" />
              Agendados
            </div>
          </div>

          <div className="bg-green-50 p-4 rounded-lg text-center border border-green-200">
            <div className="text-2xl font-bold text-green-600">
              {dailyStats.confirmed}
            </div>
            <div className="text-sm text-green-700 flex items-center justify-center">
              <CheckCircle className="h-3 w-3 mr-1" />
              Confirmados
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg text-center border border-gray-200">
            <div className="text-2xl font-bold text-gray-600">
              {dailyStats.completed}
            </div>
            <div className="text-sm text-gray-700 flex items-center justify-center">
              <Check className="h-3 w-3 mr-1" />
              Concluídos
            </div>
          </div>

          <div className="bg-red-50 p-4 rounded-lg text-center border border-red-200">
            <div className="text-2xl font-bold text-red-600">
              {dailyStats.cancelled}
            </div>
            <div className="text-sm text-red-700 flex items-center justify-center">
              <XCircle className="h-3 w-3 mr-1" />
              Cancelados
            </div>
          </div>

          <div className="bg-green-50 p-4 rounded-lg text-center border border-green-200">
            <div className="text-lg font-bold text-green-600">
              {formatCurrency(dailyStats.totalValue)}
            </div>
            <div className="text-sm text-green-700 flex items-center justify-center">
              <DollarSign className="h-3 w-3 mr-1" />
              Total
            </div>
          </div>

          <div className="bg-yellow-50 p-4 rounded-lg text-center border border-yellow-200">
            <div className="text-lg font-bold text-yellow-600">
              {formatCurrency(dailyStats.convenioValue)}
            </div>
            <div className="text-sm text-yellow-700 flex items-center justify-center">
              <DollarSign className="h-3 w-3 mr-1" />
              Convênio
            </div>
          </div>
        </div>
      )}

      {/* Agenda View */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando agenda...</p>
          </div>
        ) : (
          <>
            <div className="hidden md:flex">
              {/* Time Column */}
              <div className="w-24 bg-gray-50 border-r border-gray-200">
                <div className="sticky top-0 bg-gray-100 p-3 border-b border-gray-200">
                  <div className="text-xs font-medium text-gray-600 text-center">
                    HORÁRIO
                  </div>
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
                  <div className="text-xs font-medium text-gray-600 text-center">
                    CONSULTAS
                  </div>
                </div>
                <div className="relative">
                  {timeSlots.map((timeSlot) => {
                    const consultation = consultationsByTime[timeSlot];

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
                                  {consultation.is_dependent ? (
                                    <Users className="h-4 w-4 text-blue-600 mr-2" />
                                  ) : consultation.patient_type ===
                                    "private" ? (
                                    <User className="h-4 w-4 text-purple-600 mr-2" />
                                  ) : (
                                    <User className="h-4 w-4 text-green-600 mr-2" />
                                  )}
                                  <span className="font-medium text-gray-900 text-sm">
                                    {consultation.client_name}
                                  </span>
                                  {consultation.is_dependent && (
                                    <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                      Dependente
                                    </span>
                                  )}
                                  {consultation.patient_type === "private" && (
                                    <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                                      Particular
                                    </span>
                                  )}

                                  {/* WhatsApp Button */}
                                  <button
                                    onClick={() => openWhatsApp(consultation)}
                                    className="ml-2 p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded transition-colors"
                                    title="Enviar mensagem no WhatsApp"
                                  >
                                    <MessageCircle className="h-4 w-4" />
                                  </button>
                                </div>
                                <div className="flex items-center space-x-4">
                                  <p className="text-xs text-gray-600">
                                    {consultation.service_name}
                                  </p>
                                  <p className="text-xs font-medium text-green-600">
                                    {formatCurrency(consultation.value)}
                                  </p>
                                  {consultation.location_name && (
                                    <p className="text-xs text-gray-500">
                                      {consultation.location_name}
                                    </p>
                                  )}
                                </div>
                                {consultation.notes && (
                                  <p className="text-xs text-gray-500 mt-1 italic truncate">
                                    "{consultation.notes}"
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center space-x-2">
                              {/* Edit Button */}
                              <button
                                onClick={() => openEditModal(consultation)}
                                className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                title="Editar consulta"
                              >
                                <Edit className="h-4 w-4" />
                              </button>

                              {/* Status Button */}
                              <button
                                onClick={() => openStatusModal(consultation)}
                                className={`px-2 py-1 rounded text-xs font-medium flex items-center border transition-all hover:shadow-sm ${
                                  getStatusInfo(consultation.status).className
                                }`}
                                title="Clique para alterar o status"
                              >
                                {getStatusInfo(consultation.status).icon}
                                {getStatusInfo(consultation.status).text}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 italic">
                            Horário livre
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="md:hidden">
              <div className="p-4 space-y-3">
                {timeSlots.map((timeSlot) => {
                  const consultation = consultationsByTime[timeSlot];

                  // Skip empty slots on mobile
                  if (!consultation) return null;

                  return (
                    <div
                      key={timeSlot}
                      className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm"
                    >
                      {/* Time Header */}
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-gray-600" />
                          <span className="font-semibold text-gray-900">
                            {timeSlot}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <button
                          onClick={() => openStatusModal(consultation)}
                          className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 border transition-all ${
                            getStatusInfo(consultation.status).className
                          }`}
                        >
                          {getStatusInfo(consultation.status).icon}
                          {getStatusInfo(consultation.status).text}
                        </button>
                      </div>

                      {/* Patient Info */}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {consultation.is_dependent ? (
                              <Users className="h-4 w-4 text-blue-600 flex-shrink-0" />
                            ) : consultation.patient_type === "private" ? (
                              <User className="h-4 w-4 text-purple-600 flex-shrink-0" />
                            ) : (
                              <User className="h-4 w-4 text-green-600 flex-shrink-0" />
                            )}
                            <span className="font-medium text-gray-900 text-sm truncate">
                              {consultation.client_name}
                            </span>
                          </div>

                          {/* WhatsApp Button */}
                          <button
                            onClick={() => openWhatsApp(consultation)}
                            className="p-1.5 text-green-600 hover:text-green-800 bg-green-50 hover:bg-green-100 rounded transition-colors flex-shrink-0"
                            title="Enviar mensagem no WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Patient Type Badges */}
                        <div className="flex flex-wrap gap-1.5">
                          {consultation.is_dependent && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                              Dependente
                            </span>
                          )}
                          {consultation.patient_type === "private" && (
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs">
                              Particular
                            </span>
                          )}
                        </div>

                        {/* Service and Value */}
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">
                            {consultation.service_name}
                          </span>
                          <span className="font-semibold text-green-600">
                            {formatCurrency(consultation.value)}
                          </span>
                        </div>

                        {/* Location */}
                        {consultation.location_name && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <MapPin className="h-3 w-3" />
                            {consultation.location_name}
                          </div>
                        )}

                        {/* Notes */}
                        {consultation.notes && (
                          <p className="text-xs text-gray-500 italic bg-gray-50 p-2 rounded">
                            "{consultation.notes}"
                          </p>
                        )}

                        {/* Action Button */}
                        <button
                          onClick={() => openEditModal(consultation)}
                          className="w-full mt-2 py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                          Editar Consulta
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Add consultation button for mobile */}
                {consultations.length > 0 && (
                  <button
                    onClick={() => setShowNewModal(true)}
                    className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <Plus className="h-5 w-5" />
                    Agendar Nova Consulta
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Empty State */}
        {!isLoading && consultations.length === 0 && (
          <div className="text-center py-12">
            <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhuma consulta para este dia
            </h3>
            <p className="text-gray-600 mb-4">
              Sua agenda está livre para{" "}
              {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
            </p>
            <button
              onClick={() => setShowNewModal(true)}
              className="btn btn-primary inline-flex items-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Agendar Consulta
            </button>
          </div>
        )}
      </div>

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

            <form onSubmit={createConsultation} className="p-6">
              <div className="space-y-6">
                {/* Patient Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Paciente *
                  </label>
                  <select
                    value={formData.patient_type}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        patient_type: e.target.value as "convenio" | "private",
                        client_cpf: "",
                        private_patient_id: "",
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
                          {patient.name} -{" "}
                          {patient.cpf
                            ? formatCpf(patient.cpf)
                            : "CPF não informado"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Convenio Client Search */}
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

                {/* Recurring Consultation Checkbox */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.is_recurring}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          is_recurring: e.target.checked,
                        }))
                      }
                      className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                    />
                    <span className="ml-3 flex items-center">
                      <Repeat className="h-4 w-4 text-blue-600 mr-2" />
                      <span className="font-medium text-blue-900">
                        Consulta Recorrente
                      </span>
                    </span>
                  </label>

                  {formData.is_recurring && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-blue-700 mb-1">
                          Tipo de Recorrência
                        </label>
                        <select
                          value={formData.recurrence_type}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              recurrence_type: e.target.value as
                                | "daily"
                                | "weekly",
                            }))
                          }
                          className="input"
                        >
                          <option value="daily">Diário</option>
                          <option value="weekly">Semanal</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-blue-700 mb-1">
                          Intervalo
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="30"
                          value={formData.recurrence_interval}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              recurrence_interval: Number.parseInt(
                                e.target.value
                              ),
                            }))
                          }
                          className="input"
                        />
                        <p className="text-xs text-blue-600 mt-1">
                          {formData.recurrence_type === "daily"
                            ? "A cada quantos dias"
                            : "A cada quantas semanas"}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-blue-700 mb-1">
                          Quantidade
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="52"
                          value={formData.occurrences}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              occurrences: Number.parseInt(e.target.value),
                            }))
                          }
                          className="input"
                        />
                        <p className="text-xs text-blue-600 mt-1">
                          Número de consultas
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Date and Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data {formData.is_recurring ? "de Início" : ""} *
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
                  {isCreating
                    ? formData.is_recurring
                      ? "Criando Consultas..."
                      : "Criando..."
                    : formData.is_recurring
                    ? "Criar Consultas Recorrentes"
                    : "Criar Consulta"}
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
                <h2 className="text-xl font-bold">Alterar Status</h2>
                <button
                  onClick={closeStatusModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Consultation Info */}
              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <div className="flex items-center mb-2">
                  {selectedConsultation.is_dependent ? (
                    <Users className="h-4 w-4 text-blue-600 mr-2" />
                  ) : (
                    <User className="h-4 w-4 text-green-600 mr-2" />
                  )}
                  <span className="font-medium">
                    {selectedConsultation.client_name}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Serviço:</strong> {selectedConsultation.service_name}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Data/Hora:</strong>{" "}
                  {format(
                    new Date(selectedConsultation.date),
                    "dd/MM/yyyy 'às' HH:mm"
                  )}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Valor:</strong>{" "}
                  {formatCurrency(selectedConsultation.value)}
                </p>
              </div>

              {/* Status Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Selecione o novo status:
                </label>

                <div className="space-y-2">
                  {[
                    {
                      value: "scheduled",
                      label: "Agendado",
                      icon: <Clock className="h-4 w-4" />,
                      color: "blue",
                    },
                    {
                      value: "confirmed",
                      label: "Confirmado",
                      icon: <CheckCircle className="h-4 w-4" />,
                      color: "green",
                    },
                    {
                      value: "completed",
                      label: "Concluído",
                      icon: <Check className="h-4 w-4" />,
                      color: "gray",
                    },
                    {
                      value: "cancelled",
                      label: "Cancelado",
                      icon: <XCircle className="h-4 w-4" />,
                      color: "red",
                    },
                  ].map((status) => (
                    <label
                      key={status.value}
                      className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                        newStatus === status.value
                          ? `border-${status.color}-300 bg-${status.color}-50`
                          : "border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="status"
                        value={status.value}
                        checked={newStatus === status.value}
                        onChange={(e) => setNewStatus(e.target.value as any)}
                        className={`text-${status.color}-600 focus:ring-${status.color}-500`}
                      />
                      <div className="ml-3 flex items-center">
                        <div className={`text-${status.color}-600 mr-2`}>
                          {status.icon}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {status.label}
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
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
                  disabled={
                    isUpdatingStatus ||
                    newStatus === selectedConsultation.status
                  }
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
      <EditConsultationModal
        isOpen={showEditModal}
        consultation={consultationToEdit}
        onClose={closeEditModal}
        onSuccess={handleEditSuccess}
      />

      {/* Recurring Consultation Modal */}
      <RecurringConsultationModal
        isOpen={showRecurringModal}
        onClose={() => setShowRecurringModal(false)}
        onSuccess={() => {
          fetchData();
          setSuccess("Consultas recorrentes criadas com sucesso!");
          setTimeout(() => setSuccess(""), 3000);
        }}
      />
    </div>
  );
};

export default SchedulingPageWithExtras;
