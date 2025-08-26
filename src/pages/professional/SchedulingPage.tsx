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
  PlayCircle,
} from "lucide-react";
import { format, addDays, subDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

type Appointment = {
  id: number;
  date: string;
  time: string;
  client_name: string;
  service_name: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
  value: number;
  notes?: string;
  is_dependent: boolean;
  session_number?: number;
  total_sessions?: number;
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
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [attendanceLocations, setAttendanceLocations] = useState<
    AttendanceLocation[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // New appointment modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Status change modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(null);
  const [newStatus, setNewStatus] = useState<
    "scheduled" | "confirmed" | "completed" | "cancelled"
  >("scheduled");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Reschedule modal
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleData, setRescheduleData] = useState({
    date: "",
    time: "",
  });

  // Form state
  const [formData, setFormData] = useState({
    patient_type: "convenio",
    client_cpf: "",
    private_patient_id: "",
    date: format(new Date(), "yyyy-MM-dd"),
    time: "",
    service_id: "",
    value: "",
    location_id: "",
    notes: "",
    is_recurring: false,
    total_sessions: 1,
    recurring_days: [] as string[],
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

      console.log("🔄 Fetching appointments for date:", dateStr);

      // Fetch appointments for the specific professional
      const appointmentsResponse = await fetch(`${apiUrl}/api/consultations`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (appointmentsResponse.ok) {
        const appointmentsData = await appointmentsResponse.json();
        console.log("✅ Raw appointments data:", appointmentsData);

        // Filter by selected date and professional, convert to appointment format
        const filteredAppointments = appointmentsData
          .filter((appointment: any) => {
            const appointmentDate = appointment.appointment_date;
            return appointmentDate === dateStr;
          })
          .map((appointment: any) => ({
          id: appointment.id,
          date: `${appointment.appointment_date}T${appointment.appointment_time}`,
          time: appointment.appointment_time,
          client_name: appointment.patient_name || 'Paciente não identificado',
          service_name: appointment.service_name || 'Serviço não identificado',
          status: appointment.status || "scheduled",
          value: 0, // Will be filled from service data if needed
          notes: appointment.notes || "",
          is_dependent: appointment.patient_type === 'dependent',
          session_number: appointment.session_number || null,
          total_sessions: appointment.total_sessions || null,
        }));

        console.log("✅ Processed appointments:", formattedAppointments);
        setAppointments(formattedAppointments);
      } else {
        console.error(
          "Appointments response error:",
          appointmentsResponse.status
        );
        setAppointments([]);
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
        console.log("Services loaded:", servicesData.length);
        setServices(servicesData);
      } else {
        console.error("Services response error:", servicesResponse.status);
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
        console.log("Private patients loaded:", patientsData.length);
        setPrivatePatients(Array.isArray(patientsData) ? patientsData : []);
      } else {
        console.error(
          "Private patients response error:",
          patientsResponse.status
        );
        setPrivatePatients([]);
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
        console.log("Attendance locations loaded:", locationsData.length);
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
      } else {
        console.error(
          "Attendance locations response error:",
          locationsResponse.status
        );
        setAttendanceLocations([]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setError("Não foi possível carregar os dados da agenda");
    } finally {
      setIsLoading(false);
    }
  };

  const createAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      setIsCreating(true);
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      // Validar campos obrigatórios
      if (!formData.service_id || !formData.date || !formData.time) {
        throw new Error("Serviço, data e horário são obrigatórios");
      }

      if (formData.patient_type === "private" && !formData.private_patient_id) {
        throw new Error("Selecione um paciente particular");
      }

      if (formData.patient_type === "convenio" && !formData.client_cpf) {
        throw new Error("CPF do cliente é obrigatório");
      }

      // Criar consulta única
      const consultationData = {
        user_id: formData.patient_type === "convenio" ? clientData?.id : null,
        private_patient_id:
          formData.patient_type === "private"
            ? parseInt(formData.private_patient_id)
            : null,
        service_id: parseInt(formData.service_id),
        location_id: formData.location_id
          ? parseInt(formData.location_id)
          : null,
        value: parseFloat(formData.value),
        date: new Date(`${formData.date}T${formData.time}`).toISOString(),
        appointment_date: formData.date,
        appointment_time: formData.time,
        create_appointment: true,
        notes: formData.notes,
      };

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
      setShowNewModal(false);
      setFormData({
        patient_type: "convenio",
        client_cpf: "",
        private_patient_id: "",
        date: format(new Date(), "yyyy-MM-dd"),
        time: "",
        service_id: "",
        value: "",
        location_id: "",
        notes: "",
        is_recurring: false,
        total_sessions: 1,
        recurring_days: [],
      });
      await fetchData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      console.error("❌ Error in createAppointment:", error);
      setError(
        error instanceof Error ? error.message : "Erro ao criar agendamento"
      );
    } finally {
      setIsCreating(false);
    }
  };

  const openStatusModal = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setNewStatus(appointment.status);
    setShowStatusModal(true);
    setError("");
  };

  const closeStatusModal = () => {
    setShowStatusModal(false);
    setSelectedAppointment(null);
    setError("");
  };

  const openRescheduleModal = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setRescheduleData({
      date: format(new Date(appointment.date), "yyyy-MM-dd"),
      time: appointment.time,
    });
    setShowRescheduleModal(true);
    setError("");
  };

  const closeRescheduleModal = () => {
    setShowRescheduleModal(false);
    setSelectedAppointment(null);
    setRescheduleData({ date: "", time: "" });
    setError("");
  };

  const handleReschedule = async () => {
    if (!selectedAppointment) return;

    try {
      setIsRescheduling(true);
      setError("");

      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const response = await fetch(
        `${apiUrl}/api/consultations/${selectedAppointment.id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date: new Date(`${rescheduleData.date}T${rescheduleData.time}`).toISOString(),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao reagendar consulta");
      }

      await fetchData();
      setShowRescheduleModal(false);
      setSelectedAppointment(null);
      setSuccess("Consulta reagendada com sucesso!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      console.error("❌ Error in createAppointment:", error);
      setError(
        error instanceof Error ? error.message : "Erro ao reagendar consulta"
      );
    } finally {
      setIsRescheduling(false);
    }
  };

  const updateAppointmentStatus = async () => {
    if (!selectedAppointment) return;

    try {
      setIsUpdatingStatus(true);
      setError("");

      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      console.log("🔄 Updating appointment status:", {
        id: selectedAppointment.id,
        newStatus,
        currentStatus: selectedAppointment.status,
      });

      const response = await fetch(
        `${apiUrl}/api/consultations/${selectedAppointment.id}/status`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      console.log("📡 Status update response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ Status update error:", errorData);
        throw new Error(errorData.message || "Erro ao atualizar status");
      }

      const responseData = await response.json();
      console.log("✅ Status update response:", responseData);

      await fetchData();
      setShowStatusModal(false);
      setSelectedAppointment(null);
      setSuccess("Status atualizado com sucesso!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      console.error("❌ Error updating status:", error);
      setError(
        error instanceof Error ? error.message : "Erro ao atualizar status"
      );
    } finally {
      setIsUpdatingStatus(false);
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

  const handleRecurringDayChange = (day: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      recurring_days: checked
        ? [...prev.recurring_days, day]
        : prev.recurring_days.filter((d) => d !== day),
    }));
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
  const dailyAppointments = appointments.sort((a, b) =>
    a.time.localeCompare(b.time)
  );

  const daysOfWeek = [
    { value: "monday", label: "Segunda" },
    { value: "tuesday", label: "Terça" },
    { value: "wednesday", label: "Quarta" },
    { value: "thursday", label: "Quinta" },
    { value: "friday", label: "Sexta" },
    { value: "saturday", label: "Sábado" },
    { value: "sunday", label: "Domingo" },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600">
            Visualize e gerencie seus agendamentos
          </p>
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

      {/* Navegação de Data */}
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
              {format(selectedDate, "