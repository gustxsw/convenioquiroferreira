import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  Calendar,
  Clock,
  User,
  Users,
  MapPin,
  FileText,
  Plus,
  Edit,
  Trash2,
  X,
  Check,
  AlertCircle,
  CheckCircle,
  Search,
} from "lucide-react";

type Appointment = {
  id: number;
  client_id: number | null;
  dependent_id: number | null;
  private_patient_id: number | null;
  professional_id: number;
  service_id: number;
  location_id: number | null;
  date: string;
  time: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  client_name: string | null;
  dependent_name: string | null;
  private_patient_name: string | null;
  service_name: string;
  location_name: string | null;
  value: number;
};

type Consultation = {
  id: number;
  client_id: number | null;
  dependent_id: number | null;
  private_patient_id: number | null;
  professional_id: number;
  service_id: number;
  location_id: number | null;
  value: number;
  date: string;
  created_at: string;
  updated_at: string;
  // Joined data
  client_name: string | null;
  dependent_name: string | null;
  private_patient_name: string | null;
  service_name: string;
  location_name: string | null;
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
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    private_patient_id: "",
    service_id: "",
    location_id: "",
    date: "",
    time: "",
    notes: "",
    value: "",
  });

  // Search state
  const [searchTerm, setSearchTerm] = useState("");

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

      console.log("🔄 [SCHEDULING] Fetching scheduling data from:", apiUrl);
      console.log("🔄 [SCHEDULING] Selected date:", selectedDate);
      console.log("🔄 [SCHEDULING] Professional ID:", user?.id);

      // Fetch appointments for the selected date
      const appointmentsResponse = await fetch(
        `${apiUrl}/api/appointments?date=${selectedDate}&professional_id=${user?.id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("📡 [SCHEDULING] Appointments response status:", appointmentsResponse.status);

      if (appointmentsResponse.ok) {
        const appointmentsData = await appointmentsResponse.json();
        console.log("✅ [SCHEDULING] Appointments loaded:", appointmentsData.length);
        setAppointments(appointmentsData);
      } else {
        const errorText = await appointmentsResponse.text();
        console.error("❌ [SCHEDULING] Appointments error:", errorText);
        
        if (appointmentsResponse.status === 404) {
          console.log("ℹ️ [SCHEDULING] No appointments found for date, starting with empty list");
          setAppointments([]);
        } else {
          console.warn("⚠️ [SCHEDULING] Appointments not available:", appointmentsResponse.status);
          setAppointments([]);
        }
      }

      // Fetch consultations for the selected date to show completed ones
      const consultationsResponse = await fetch(
        `${apiUrl}/api/consultations?date=${selectedDate}&professional_id=${user?.id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("📡 [SCHEDULING] Consultations response status:", consultationsResponse.status);

      if (consultationsResponse.ok) {
        const consultationsData = await consultationsResponse.json();
        console.log("✅ [SCHEDULING] Consultations loaded:", consultationsData.length);
        setConsultations(consultationsData);
      } else {
        const errorText = await consultationsResponse.text();
        console.error("❌ [SCHEDULING] Consultations error:", errorText);
        
        if (consultationsResponse.status === 404) {
          console.log("ℹ️ [SCHEDULING] No consultations found for date, starting with empty list");
          setConsultations([]);
        } else {
          console.warn("⚠️ [SCHEDULING] Consultations not available:", consultationsResponse.status);
          setConsultations([]);
        }
      }

      // Fetch services
      const servicesResponse = await fetch(`${apiUrl}/api/services`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (servicesResponse.ok) {
        const servicesData = await servicesResponse.json();
        console.log("✅ [SCHEDULING] Services loaded:", servicesData.length);
        setServices(servicesData);
      } else {
        console.warn("⚠️ [SCHEDULING] Services not available:", servicesResponse.status);
        setServices([]);
      }

      // Fetch attendance locations
      const locationsResponse = await fetch(`${apiUrl}/api/attendance-locations`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        console.log("✅ [SCHEDULING] Locations loaded:", locationsData.length);
        setLocations(locationsData);
      } else {
        console.warn("⚠️ [SCHEDULING] Locations not available:", locationsResponse.status);
        setLocations([]);
      }

      // Fetch private patients
      const patientsResponse = await fetch(`${apiUrl}/api/private-patients`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (patientsResponse.ok) {
        const patientsData = await patientsResponse.json();
        console.log("✅ [SCHEDULING] Private patients loaded:", patientsData.length);
        setPrivatePatients(patientsData);
      } else {
        console.warn("⚠️ [SCHEDULING] Private patients not available:", patientsResponse.status);
        setPrivatePatients([]);
      }
    } catch (error) {
      console.error("❌ [SCHEDULING] Error fetching data:", error);
      setError("Não foi possível carregar os dados da agenda");
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setModalMode("create");
    setFormData({
      private_patient_id: "",
      service_id: "",
      location_id: locations.find(l => l.is_default)?.id.toString() || "",
      date: selectedDate,
      time: "",
      notes: "",
      value: "",
    });
    setSelectedAppointment(null);
    setIsModalOpen(true);
  };

  const openEditModal = (appointment: Appointment) => {
    setModalMode("edit");
    setFormData({
      private_patient_id: appointment.private_patient_id?.toString() || "",
      service_id: appointment.service_id.toString(),
      location_id: appointment.location_id?.toString() || "",
      date: appointment.date.split("T")[0],
      time: appointment.time,
      notes: appointment.notes || "",
      value: appointment.value.toString(),
    });
    setSelectedAppointment(appointment);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setError("");
    setSuccess("");
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Auto-fill value when service is selected
    if (name === "service_id" && value) {
      const selectedService = services.find(s => s.id === parseInt(value));
      if (selectedService) {
        setFormData((prev) => ({ ...prev, value: selectedService.base_price.toString() }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      // Validate required fields
      if (!formData.private_patient_id) {
        setError("Selecione um paciente");
        return;
      }

      if (!formData.service_id) {
        setError("Selecione um serviço");
        return;
      }

      if (!formData.date || !formData.time) {
        setError("Data e hora são obrigatórios");
        return;
      }

      if (!formData.value || Number(formData.value) <= 0) {
        setError("Valor deve ser maior que zero");
        return;
      }

      const appointmentData = {
        private_patient_id: parseInt(formData.private_patient_id),
        service_id: parseInt(formData.service_id),
        location_id: formData.location_id ? parseInt(formData.location_id) : null,
        date: formData.date,
        time: formData.time,
        notes: formData.notes || null,
        value: Number(formData.value),
      };

      console.log("🔄 [SCHEDULING] Submitting appointment:", appointmentData);

      const url = modalMode === "create" 
        ? `${apiUrl}/api/appointments`
        : `${apiUrl}/api/appointments/${selectedAppointment?.id}`;

      const method = modalMode === "create" ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(appointmentData),
      });

      console.log("📡 [SCHEDULING] Appointment response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ [SCHEDULING] Appointment error:", errorData);
        throw new Error(errorData.message || "Erro ao salvar agendamento");
      }

      const responseData = await response.json();
      console.log("✅ [SCHEDULING] Appointment saved:", responseData);

      setSuccess(
        modalMode === "create"
          ? "Agendamento criado com sucesso!"
          : "Agendamento atualizado com sucesso!"
      );

      await fetchData();

      setTimeout(() => {
        closeModal();
      }, 1500);
    } catch (error) {
      console.error("❌ [SCHEDULING] Error in handleSubmit:", error);
      setError(
        error instanceof Error ? error.message : "Erro ao salvar agendamento"
      );
    }
  };

  const markAsCompleted = async (appointment: Appointment) => {
    try {
      setError("");
      setSuccess("");

      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      console.log("🔄 [SCHEDULING] Marking appointment as completed:", appointment.id);

      // Create consultation record when marking as completed
      const consultationData = {
        client_id: appointment.client_id,
        dependent_id: appointment.dependent_id,
        private_patient_id: appointment.private_patient_id,
        professional_id: appointment.professional_id,
        service_id: appointment.service_id,
        location_id: appointment.location_id,
        value: appointment.value,
        date: new Date(`${appointment.date}T${appointment.time}`).toISOString(),
        appointment_id: appointment.id,
      };

      console.log("🔄 [SCHEDULING] Creating consultation from appointment:", consultationData);

      const consultationResponse = await fetch(`${apiUrl}/api/consultations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(consultationData),
      });

      console.log("📡 [SCHEDULING] Consultation creation response status:", consultationResponse.status);

      if (!consultationResponse.ok) {
        const errorData = await consultationResponse.json();
        console.error("❌ [SCHEDULING] Consultation creation error:", errorData);
        throw new Error(errorData.message || "Erro ao criar registro de consulta");
      }

      const consultationResult = await consultationResponse.json();
      console.log("✅ [SCHEDULING] Consultation created:", consultationResult);

      // Update appointment status to completed
      const updateResponse = await fetch(`${apiUrl}/api/appointments/${appointment.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...appointment,
          status: "completed",
        }),
      });

      console.log("📡 [SCHEDULING] Appointment update response status:", updateResponse.status);

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        console.error("❌ [SCHEDULING] Appointment update error:", errorData);
        throw new Error(errorData.message || "Erro ao atualizar status do agendamento");
      }

      console.log("✅ [SCHEDULING] Appointment marked as completed");

      setSuccess("Consulta registrada e agendamento marcado como concluído!");
      await fetchData();
    } catch (error) {
      console.error("❌ [SCHEDULING] Error marking as completed:", error);
      setError(
        error instanceof Error ? error.message : "Erro ao marcar como concluído"
      );
    }
  };

  const deleteAppointment = async (appointmentId: number) => {
    try {
      setError("");
      setSuccess("");

      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      console.log("🔄 [SCHEDULING] Deleting appointment:", appointmentId);

      const response = await fetch(`${apiUrl}/api/appointments/${appointmentId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      console.log("📡 [SCHEDULING] Delete appointment response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ [SCHEDULING] Delete appointment error:", errorData);
        throw new Error(errorData.message || "Erro ao excluir agendamento");
      }

      console.log("✅ [SCHEDULING] Appointment deleted successfully");

      setSuccess("Agendamento excluído com sucesso!");
      await fetchData();
    } catch (error) {
      console.error("❌ [SCHEDULING] Error deleting appointment:", error);
      setError(
        error instanceof Error ? error.message : "Erro ao excluir agendamento"
      );
    }
  };

  const formatTime = (timeString: string) => {
    return timeString.slice(0, 5); // HH:MM
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPatientName = (appointment: Appointment | Consultation) => {
    if (appointment.private_patient_name) {
      return appointment.private_patient_name;
    }
    if (appointment.dependent_name) {
      return `${appointment.dependent_name} (Dep. de ${appointment.client_name})`;
    }
    if (appointment.client_name) {
      return appointment.client_name;
    }
    return "Paciente não identificado";
  };

  const getPatientIcon = (appointment: Appointment | Consultation) => {
    if (appointment.private_patient_id) {
      return <User className="h-4 w-4 text-purple-600" />;
    }
    if (appointment.dependent_id) {
      return <Users className="h-4 w-4 text-blue-600" />;
    }
    return <User className="h-4 w-4 text-green-600" />;
  };

  // Filter appointments and consultations by search term
  const filteredAppointments = appointments.filter((appointment) => {
    if (!searchTerm) return true;
    const patientName = getPatientName(appointment).toLowerCase();
    const serviceName = appointment.service_name.toLowerCase();
    return (
      patientName.includes(searchTerm.toLowerCase()) ||
      serviceName.includes(searchTerm.toLowerCase())
    );
  });

  const filteredConsultations = consultations.filter((consultation) => {
    if (!searchTerm) return true;
    const patientName = getPatientName(consultation).toLowerCase();
    const serviceName = consultation.service_name.toLowerCase();
    return (
      patientName.includes(searchTerm.toLowerCase()) ||
      serviceName.includes(searchTerm.toLowerCase())
    );
  });

  // Sort appointments by time
  const sortedAppointments = [...filteredAppointments].sort((a, b) => {
    return a.time.localeCompare(b.time);
  });

  // Sort consultations by date (most recent first)
  const sortedConsultations = [...filteredConsultations].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600">
            Gerencie seus agendamentos e consultas realizadas
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="btn btn-primary flex items-center"
          disabled={privatePatients.length === 0}
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Agendamento
        </button>
      </div>

      {/* Date selector and search */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Selecionar Data
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="input"
          />
        </div>

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
      </div>

      {/* Info about private patients requirement */}
      {privatePatients.length === 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-600 p-4 mb-6">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
            <p className="text-yellow-700">
              Você precisa cadastrar pacientes particulares antes de criar agendamentos.
            </p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appointments for selected date */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center mb-4">
            <Calendar className="h-6 w-6 text-red-600 mr-2" />
            <h2 className="text-xl font-semibold">
              Agendamentos - {new Date(selectedDate).toLocaleDateString("pt-BR")}
            </h2>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Carregando agendamentos...</p>
            </div>
          ) : sortedAppointments.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? "Nenhum agendamento encontrado" : "Nenhum agendamento para esta data"}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchTerm
                  ? "Tente ajustar os termos de busca."
                  : "Não há agendamentos para o dia selecionado."
                }
              </p>
              {!searchTerm && privatePatients.length > 0 && (
                <button
                  onClick={openCreateModal}
                  className="btn btn-primary inline-flex items-center"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Criar Agendamento
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {sortedAppointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className={`p-4 rounded-lg border-2 transition-colors ${
                    appointment.status === "completed"
                      ? "border-green-200 bg-green-50"
                      : appointment.status === "cancelled"
                      ? "border-red-200 bg-red-50"
                      : "border-blue-200 bg-blue-50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <Clock className="h-4 w-4 text-gray-500 mr-2" />
                        <span className="font-semibold text-gray-900">
                          {formatTime(appointment.time)}
                        </span>
                        <span
                          className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${
                            appointment.status === "completed"
                              ? "bg-green-100 text-green-800"
                              : appointment.status === "cancelled"
                              ? "bg-red-100 text-red-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {appointment.status === "completed"
                            ? "Concluído"
                            : appointment.status === "cancelled"
                            ? "Cancelado"
                            : "Agendado"}
                        </span>
                      </div>

                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex items-center">
                          {getPatientIcon(appointment)}
                          <span className="ml-2 font-medium">
                            {getPatientName(appointment)}
                          </span>
                        </div>

                        <div className="flex items-center">
                          <FileText className="h-4 w-4 text-gray-400 mr-2" />
                          <span>{appointment.service_name}</span>
                          <span className="ml-2 font-medium text-green-600">
                            {formatCurrency(appointment.value)}
                          </span>
                        </div>

                        {appointment.location_name && (
                          <div className="flex items-center">
                            <MapPin className="h-4 w-4 text-gray-400 mr-2" />
                            <span>{appointment.location_name}</span>
                          </div>
                        )}

                        {appointment.notes && (
                          <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                            <strong>Observações:</strong> {appointment.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      {appointment.status === "scheduled" && (
                        <>
                          <button
                            onClick={() => markAsCompleted(appointment)}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                            title="Marcar como Concluído"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(appointment)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => deleteAppointment(appointment.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Consultations (completed) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center mb-4">
            <CheckCircle className="h-6 w-6 text-green-600 mr-2" />
            <h2 className="text-xl font-semibold">Consultas Realizadas</h2>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Carregando consultas...</p>
            </div>
          ) : sortedConsultations.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? "Nenhuma consulta encontrada" : "Nenhuma consulta realizada"}
              </h3>
              <p className="text-gray-600">
                {searchTerm
                  ? "Tente ajustar os termos de busca."
                  : "As consultas concluídas aparecerão aqui."
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {sortedConsultations.map((consultation) => (
                <div
                  key={consultation.id}
                  className="p-4 rounded-lg border border-green-200 bg-green-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                        <span className="font-semibold text-gray-900">
                          {formatDate(consultation.date)}
                        </span>
                      </div>

                      <div className="space-y-1 text-sm text-gray-600">
                        <div className="flex items-center">
                          {getPatientIcon(consultation)}
                          <span className="ml-2 font-medium">
                            {getPatientName(consultation)}
                          </span>
                        </div>

                        <div className="flex items-center">
                          <FileText className="h-4 w-4 text-gray-400 mr-2" />
                          <span>{consultation.service_name}</span>
                          <span className="ml-2 font-medium text-green-600">
                            {formatCurrency(consultation.value)}
                          </span>
                        </div>

                        {consultation.location_name && (
                          <div className="flex items-center">
                            <MapPin className="h-4 w-4 text-gray-400 mr-2" />
                            <span>{consultation.location_name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Appointment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">
                {modalMode === "create" ? "Novo Agendamento" : "Editar Agendamento"}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Paciente *
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
                        {patient.cpf && ` - CPF: ${patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}`}
                      </option>
                    ))}
                  </select>
                </div>

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
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name} {location.is_default && "(Padrão)"}
                      </option>
                    ))}
                  </select>
                </div>

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

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`btn btn-primary ${
                    isLoading ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                  disabled={isLoading}
                >
                  {isLoading
                    ? "Salvando..."
                    : modalMode === "create"
                    ? "Criar Agendamento"
                    : "Salvar Alterações"}
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