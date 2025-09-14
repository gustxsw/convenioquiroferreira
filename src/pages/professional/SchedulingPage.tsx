import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
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
  Search,
  DollarSign,
  Edit,
  MessageCircle,
  Settings,
  Repeat,
  Gift,
} from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import CancelConsultationModal from "../../components/CancelConsultationModal";
import EditConsultationModal from "../../components/EditConsultationModal";
import SlotCustomizationModal from "../../components/SlotCustomizationModal";
import RecurringConsultationModal from '../../components/RecurringConsultationModal';
import SchedulingAccessPayment from '../../components/SchedulingAccessPayment';
import QuickScheduleModal from '../../components/QuickScheduleModal';

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

type SlotDuration = 15 | 30 | 60;

const SchedulingPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [attendanceLocations, setAttendanceLocations] = useState<AttendanceLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Scheduling access state
  const [hasSchedulingAccess, setHasSchedulingAccess] = useState<boolean | null>(null);
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState('');

  // Slot customization state
  const [slotDuration, setSlotDuration] = useState<SlotDuration>(() => {
    const saved = localStorage.getItem('scheduling-slot-duration');
    return saved ? (Number(saved) as SlotDuration) : 30;
  });
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [showQuickScheduleModal, setShowQuickScheduleModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string;
    time: string;
  } | null>(null);

  const [showRecurringModal, setShowRecurringModal] = useState(false);
  // New consultation modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Status change modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [newStatus, setNewStatus] = useState<"scheduled" | "confirmed" | "completed" | "cancelled">("scheduled");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Edit consultation modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [consultationToEdit, setConsultationToEdit] = useState<Consultation | null>(null);

  // Cancel consultation modal
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Slot customization
  const [slotDuration2, setSlotDuration2] = useState<SlotDuration>(() => {
    const saved = localStorage.getItem('scheduling-slot-duration');
    return (saved ? parseInt(saved) : 30) as SlotDuration;
  });
  const [showSlotModal2, setShowSlotModal2] = useState(false);

  // Recurring consultation form state
  const [recurringFormData, setRecurringFormData] = useState({
    patient_type: 'convenio' as 'convenio' | 'private',
    client_cpf: '',
    private_patient_id: '',
    service_id: '',
    value: '',
    location_id: '',
    start_date: '',
    start_time: '',
    recurrence_type: 'weekly' as 'daily' | 'weekly' | 'monthly',
    recurrence_interval: 1,
    weekly_count: 4,
    selected_weekdays: [] as number[],
    end_date: '',
    occurrences: 10,
    notes: '',
  });

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

  // Timezone conversion utilities
  const convertBrazilTimeToUTC = (date: string, time: string): string => {
    // Create date in Brazil timezone (GMT-3)
    const brazilDateTime = new Date(`${date}T${time}:00`);
    // Add 3 hours to convert to UTC
    const utcDateTime = new Date(brazilDateTime.getTime() + (3 * 60 * 60 * 1000));
    return utcDateTime.toISOString();
  };

  const convertUTCToBrazilTime = (utcDateString: string): string => {
    // Parse UTC date
    const utcDate = new Date(utcDateString);
    // Subtract 3 hours to convert to Brazil time
    const brazilDate = new Date(utcDate.getTime() - (3 * 60 * 60 * 1000));
    return format(brazilDate, 'HH:mm');
  };

  useEffect(() => {
    checkSchedulingAccess();
    fetchData();
  }, [selectedDate]);
  
  const checkSchedulingAccess = async () => {
    try {
      setIsCheckingAccess(true);
      setAccessError('');
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      console.log('🔍 Checking scheduling access...');

      const response = await fetch(`${apiUrl}/api/professional/scheduling-access`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const accessData = await response.json();
        console.log('✅ Access status received:', accessData);
        setHasSchedulingAccess(accessData.hasAccess);
        setAccessExpiresAt(accessData.expiresAt);
      } else {
        console.warn('⚠️ Access check failed:', response.status);
        setHasSchedulingAccess(false);
        setAccessExpiresAt(null);
      }
    } catch (error) {
      console.error('❌ Error checking access:', error);
      setAccessError('Erro ao verificar acesso à agenda');
      setHasSchedulingAccess(false);
      setAccessExpiresAt(null);
    } finally {
      setIsCheckingAccess(false);
    }
  };
  // Handle slot duration change
  const handleSlotDurationChange = (duration: SlotDuration) => {
    setSlotDuration(duration);
    localStorage.setItem('scheduling-slot-duration', duration.toString());
  };

  // Handle slot click for quick scheduling
  const handleSlotClick = (timeSlot: string) => {
    const consultation = consultationsByTime[timeSlot];
    
    if (consultation) {
      // If slot is occupied, do nothing (only edit button should work)
      return;
    } else {
      // If slot is empty, open quick schedule modal
      setSelectedSlot({
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: timeSlot
      });
      setShowQuickScheduleModal(true);
    }
  };

  const closeQuickScheduleModal = () => {
    setShowQuickScheduleModal(false);
    setSelectedSlot(null);
  };

  const handleQuickScheduleSuccess = () => {
    fetchData();
    setSuccess("Consulta agendada com sucesso!");
    setTimeout(() => setSuccess(""), 3000);
  };

  // Get slot styling based on patient type
  const getSlotStyling = (consultation: Consultation) => {
    if (consultation.patient_type === 'private') {
      return 'bg-purple-50 border-l-4 border-purple-500 hover:bg-purple-100';
    } else if (consultation.is_dependent) {
      return 'bg-blue-50 border-l-4 border-blue-500 hover:bg-blue-100';
    } else {
      return 'bg-green-50 border-l-4 border-green-500 hover:bg-green-100';
    }
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError("");

      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      console.log("🔄 [AGENDA] Fetching consultations for date:", dateStr);
      console.log("🔄 [AGENDA] Selected date object:", selectedDate);
      console.log("🔄 [AGENDA] Formatted date string:", dateStr);

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

      console.log("📡 [AGENDA] Consultations response status:", consultationsResponse.status);

      if (consultationsResponse.status === 403) {
        // No scheduling access
        const errorData = await consultationsResponse.json();
        if (errorData.code === 'NO_SCHEDULING_ACCESS') {
          console.log('❌ No scheduling access detected');
          setHasSchedulingAccess(false);
          setConsultations([]);
          return;
        }
      } else if (consultationsResponse.ok) {
        const consultationsData = await consultationsResponse.json();
        console.log("✅ [AGENDA] Consultations loaded:", consultationsData.length);
        console.log("✅ [AGENDA] Consultations data:", consultationsData);
        
        // Debug each consultation's date
        consultationsData.forEach((consultation, index) => {
          console.log(`🔍 [AGENDA] Consultation ${index + 1}:`, {
            id: consultation.id,
            client_name: consultation.client_name,
            date: consultation.date,
            date_parsed: new Date(consultation.date),
            date_brazil: new Date(new Date(consultation.date).getTime() - (3 * 60 * 60 * 1000)),
            time_extracted: format(new Date(consultation.date), "HH:mm")
          });
        });
        
        setConsultations(consultationsData);
      } else {
        const errorText = await consultationsResponse.text();
        console.error("❌ [AGENDA] Consultations response error:", consultationsResponse.status, errorText);
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
        setPrivatePatients(patientsData);
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
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setError("Erro ao carregar dados");
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
          `${apiUrl}/api/dependents?client_id=${clientData.id}&status=active`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (dependentsResponse.ok) {
          const dependentsData = await dependentsResponse.json();
          setDependents(dependentsData);
        }
      } else {
        // Try searching as dependent
        const dependentResponse = await fetch(
          `${apiUrl}/api/dependents/search?cpf=${cleanCpf}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
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
            subscription_status: "active", // Keep for compatibility
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

      // Create single consultation only (recurring moved to separate modal)
      const consultationData: any = {
        professional_id: user?.id,
        service_id: parseInt(formData.service_id),
        location_id: formData.location_id ? parseInt(formData.location_id) : null,
        value: parseFloat(formData.value),
        date: `${formData.date}T${formData.time}`,
        status: "scheduled",
        notes: formData.notes || null,
      };

      // Set patient based on type
      if (formData.patient_type === "private") {
        consultationData.private_patient_id = parseInt(formData.private_patient_id || '');
      } else {
        if (selectedDependentId) {
          consultationData.dependent_id = selectedDependentId;
        } else {
          consultationData.user_id = clientSearchResult?.id;
        }
      }

      console.log("🔄 Single consultation data:", consultationData);
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
        console.error("❌ Single consultation error:", errorData);
        throw new Error(errorData.message || "Falha ao criar consulta");
      }

      setSuccess("Consulta criada com sucesso!");

      await fetchData();
      setShowNewModal(false);
      resetForm();
      
      // Force refresh the current date view
      setTimeout(() => {
        fetchData();
      }, 1000);
      
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao criar consulta");
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
      setError(error instanceof Error ? error.message : "Erro ao atualizar status");
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

  const openCancelModal = (consultation: Consultation) => {
    setSelectedConsultation(consultation);
    setShowCancelModal(true);
  };

  const closeModals = () => {
    setShowCancelModal(false);
    setShowStatusModal(false);
    setSelectedConsultation(null);
    setError("");
  };

  const handleCancelConsultation = async (reason?: string) => {
    if (!selectedConsultation) return;

    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/api/consultations/${selectedConsultation.id}/cancel`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cancellation_reason: reason || null
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao cancelar consulta');
      }

      await fetchData();
      setSuccess('Consulta cancelada com sucesso! Horário liberado para novos agendamentos.');
      setTimeout(() => setSuccess(''), 5000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erro ao cancelar consulta');
    }
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
      setError(error instanceof Error ? error.message : "Erro ao abrir WhatsApp");
      setTimeout(() => setError(""), 3000);
    }
  };

  const handleSlotDurationChange2 = (duration: SlotDuration) => {
    setSlotDuration2(duration);
    localStorage.setItem('scheduling-slot-duration', duration.toString());
  };
  const formatTime = (dateString: string) => {
    // Convert from UTC (database) to Brazil local time for display
    const utcDate = new Date(dateString);
    const brazilLocalDate = new Date(utcDate.getTime() - (3 * 60 * 60 * 1000));
    return brazilLocalDate.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
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

  const generateTimeSlots = (duration: number = 30) => {
    const slots = [];
    for (let hour = 8; hour <= 18; hour++) {
      for (let minute = 0; minute < 60; minute += duration) {
        const timeStr = `${hour.toString().padStart(2, "0")}:${minute
          .toString()
          .padStart(2, "0")}`;
        slots.push(timeStr);
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots(slotDuration);
  
  // Group consultations by time for display
  const consultationsByTime = consultations.reduce((acc, consultation) => {
    // 🔥 FIXED: Simple UTC to Brazil conversion for grouping
    const utcDate = new Date(consultation.date);
    const brazilLocalDate = new Date(utcDate.getTime() - (3 * 60 * 60 * 1000));
    const timeSlot = brazilLocalDate.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    console.log('🔄 [GROUPING] Consultation:', consultation.client_name);
    console.log('🔄 [GROUPING] UTC from DB:', utcDate.toISOString());
    console.log('🔄 [GROUPING] Brazil local (-3h):', brazilLocalDate.toISOString());
    console.log('🔄 [GROUPING] Time slot:', timeSlot);
    
    acc[timeSlot] = consultation;
    return acc;
  }, {} as Record<string, Consultation>);

  // Calculate daily statistics
  const dailyStats = {
    scheduled: consultations.filter((c) => c.status === "scheduled").length,
    confirmed: consultations.filter((c) => c.status === "confirmed").length,
    completed: consultations.filter((c) => c.status === "completed").length,
    cancelled: consultations.filter((c) => c.status === "cancelled").length,
  };

  const getSlotDurationLabel = (duration: SlotDuration) => {
    switch (duration) {
      case 15:
        return "15 min";
      case 30:
        return "30 min";
      case 60:
        return "60 min";
      default:
        return "30 min";
    }
  };

  // Show loading while checking access
  if (isCheckingAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando acesso à agenda...</p>
        </div>
      </div>
    );
  }

  // Show error if access check failed
  if (accessError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Erro de Conexão</h3>
          <p className="text-gray-600 mb-4">{accessError}</p>
          <button
            onClick={checkSchedulingAccess}
            className="btn btn-primary"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  // Show payment screen if no access
  if (hasSchedulingAccess === false) {
    return (
      <SchedulingAccessPayment 
        professionalName={user?.name || 'Profissional'}
        onPaymentSuccess={() => {
          // Refresh access status after payment
          checkSchedulingAccess();
        }}
      />
    );
  }
  // Show access payment screen if no access
  if (isCheckingAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando acesso à agenda...</p>
        </div>
      </div>
    );
  }

  if (!hasSchedulingAccess) {
    return (
      <SchedulingAccessPayment 
        professionalName={user?.name || 'Profissional'}
        onPaymentSuccess={() => {
          // Refresh access status after payment
          checkSchedulingAccess();
        }}
      />
    );
  }

  // Main agenda interface (only shown when access is confirmed)
  if (hasSchedulingAccess === true) {
    return (
      <div>
        {/* Access Status Banner */}
        {hasSchedulingAccess && accessExpiresAt && (
          <div className="bg-green-50 border-l-4 border-green-600 p-4 mb-6">
            <div className="flex items-center">
              <Gift className="h-5 w-5 text-green-600 mr-2" />
              <div>
                <p className="text-green-700 font-medium">
                  Acesso à agenda ativo
                </p>
                <p className="text-green-600 text-sm">
                  Válido até: {new Date(accessExpiresAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
            <p className="text-gray-600">
              Visualize e gerencie suas consultas
            </p>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={() => setShowNewModal(true)}
              className="btn btn-primary flex items-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Nova Consulta
            </button>
            
            <button
              onClick={() => setShowRecurringModal(true)}
              className="btn btn-outline flex items-center"
            >
              <Repeat className="h-5 w-5 mr-2" />
              Consultas Recorrentes
            </button>
            
            <button
              onClick={() => setShowSlotModal(true)}
              className="btn btn-outline flex items-center"
              title="Personalizar duração dos slots"
            >
              <Settings className="h-5 w-5 mr-2" />
              Slots ({getSlotDurationLabel(slotDuration)})
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
                <span className="text-sm text-gray-500 ml-2">
                  (Slots de {slotDuration} min)
                </span>
              </h2>
              <div className="flex items-center justify-center space-x-4 text-sm text-gray-600">
                <span>{consultations.length} consulta(s)</span>
                <span>•</span>
                <span>Slots de {getSlotDurationLabel(slotDuration)}</span>
              </div>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg text-center border border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{dailyStats.scheduled}</div>
              <div className="text-sm text-blue-700 flex items-center justify-center">
                <Clock className="h-3 w-3 mr-1" />
                Agendados
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg text-center border border-green-200">
              <div className="text-2xl font-bold text-green-600">{dailyStats.confirmed}</div>
              <div className="text-sm text-green-700 flex items-center justify-center">
                <CheckCircle className="h-3 w-3 mr-1" />
                Confirmados
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg text-center border border-gray-200">
              <div className="text-2xl font-bold text-gray-600">{dailyStats.completed}</div>
              <div className="text-sm text-gray-700 flex items-center justify-center">
                <Check className="h-3 w-3 mr-1" />
                Concluídos
              </div>
            </div>

            <div className="bg-red-50 p-4 rounded-lg text-center border border-red-200">
              <div className="text-2xl font-bold text-red-600">{dailyStats.cancelled}</div>
              <div className="text-sm text-red-700 flex items-center justify-center">
                <XCircle className="h-3 w-3 mr-1" />
                Cancelados
              </div>
            </div>
          </div>
        )}

        {/* Agenda View */}
        {/* Legend */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">Legenda:</h3>
            <div className="flex items-center space-x-6 text-xs">
              <div className="flex items-center">
                <div className="w-4 h-4 bg-green-100 border-l-2 border-green-500 rounded mr-2"></div>
                <span>Cliente Titular</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-blue-100 border-l-2 border-blue-500 rounded mr-2"></div>
                <span>Dependente</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-purple-100 border-l-2 border-purple-500 rounded mr-2"></div>
                <span>Particular</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-gray-50 border border-gray-200 rounded mr-2"></div>
                <span>Slot Livre (clique para agendar)</span>
              </div>
            </div>
          </div>
        </div>

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
                      className={`${
                        slotDuration === 15 ? 'h-12' : 
                        slotDuration === 30 ? 'h-20' : 
                        'h-32'
                      } flex items-center justify-center border-b border-gray-100 text-sm font-medium text-gray-700`}
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
                    const consultation = consultationsByTime[timeSlot];
                    const isOccupied = !!consultation;

                    return (
                      <div
                        key={timeSlot}
                        onClick={() => handleSlotClick(timeSlot)}
                        className={`${
                          slotDuration === 15 ? 'h-12' : 
                          slotDuration === 30 ? 'h-20' : 
                          'h-32'
                        } border-b border-gray-100 flex items-center px-4 transition-all cursor-pointer ${
                          isOccupied 
                            ? `${getSlotStyling(consultation)}` 
                            : 'hover:bg-blue-50 hover:border-l-4 hover:border-blue-300'
                        }`}
                        title={isOccupied ? 'Use o botão de edição para editar' : 'Clique para agendar'}
                      >
                        {consultation ? (
                          <div className="flex items-center justify-between w-full">
                            <div className="flex items-center space-x-3 flex-1">
                              <div className="flex-1">
                                <div className="flex items-center mb-1">
                                  {consultation.is_dependent ? (
                                    <Users className="h-4 w-4 text-blue-600 mr-2" />
                                  ) : consultation.patient_type === "private" ? (
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
                                  {consultation.patient_type === "convenio" && !consultation.is_dependent && (
                                    <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                                      Titular
                                    </span>
                                  )}
                                  
                                  {/* WhatsApp Button */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openWhatsApp(consultation);
                                    }}
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditModal(consultation);
                                }}
                                className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                title="Editar consulta"
                              >
                                <Edit className="h-4 w-4" />
                              </button>

                              {/* Status Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openStatusModal(consultation);
                                }}
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
                          <div className="text-xs text-gray-400 italic flex items-center">
                            <Plus className="h-3 w-3 mr-1" />
                            Clique para agendar
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && consultations.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhuma consulta para este dia
              </h3>
              <p className="text-gray-600 mb-4">
                Sua agenda está livre para {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
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
                            {patient.name} - {patient.cpf ? formatCpf(patient.cpf) : "CPF não informado"}
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

                  {/* Recurring Consultation Checkbox */}
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <Repeat className="h-5 w-5 text-blue-600 mr-2" />
                        <span className="font-medium text-blue-900">Consultas Recorrentes</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewModal(false);
                          setShowRecurringModal(true);
                        }}
                        className="btn btn-secondary flex items-center"
                      >
                        <Repeat className="h-4 w-4 mr-2" />
                        Abrir Modal Recorrente
                      </button>
                    </div>
                    <p className="text-sm text-blue-700 mt-2">
                      Para criar múltiplas consultas com padrão de repetição, use o modal dedicado.
                    </p>
                  </div>

                  {/* Date and Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Data *
                      </label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, date: e.target.value }))
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
                        value={formData.time}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, time: e.target.value }))
                        }
                        className="input"
                        required
                      />
                    </div>
                  </div>

                  {/* Service */}
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

                  {/* Value */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Valor *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.value}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, value: e.target.value }))
                      }
                      className="input"
                      placeholder="0.00"
                      required
                    />
                  </div>

                  {/* Location */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Local de Atendimento
                    </label>
                    <select
                      value={formData.location_id}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, location_id: e.target.value }))
                      }
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

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Observações
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      className="input"
                      rows={3}
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
                    {isCreating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Criando...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Criar Consulta
                      </>
                    )}
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
                    <Settings className="h-6 w-6 text-blue-600 mr-2" />
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
                {/* Consultation Info */}
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <div className="flex items-center mb-2">
                    {selectedConsultation.is_dependent ? (
                      <Users className="h-4 w-4 text-blue-600 mr-2" />
                    ) : (
                      <User className="h-4 w-4 text-green-600 mr-2" />
                    )}
                    <span className="font-medium">{selectedConsultation.client_name}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-1">
                    <strong>Serviço:</strong> {selectedConsultation.service_name}
                  </p>
                  <p className="text-sm text-gray-600 mb-1">
                    <strong>Data/Hora:</strong>{" "}
                    {(() => {
                      const utcDate = new Date(selectedConsultation.date);
                      const brazilDate = new Date(utcDate.getTime() - (3 * 60 * 60 * 1000));
                      return brazilDate.toLocaleDateString('pt-BR') + ' às ' + brazilDate.toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      });
                    })()}
                  </p>
                  <p className="text-sm text-gray-600">
                    <strong>Valor:</strong> {formatCurrency(selectedConsultation.value)}
                  </p>
                </div>

                {/* Status Selection */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Selecione o novo status:
                  </label>

                  <div className="space-y-2">
                    {[
                      { value: "scheduled", label: "Agendado", icon: <Clock className="h-4 w-4" />, color: "blue" },
                      { value: "confirmed", label: "Confirmado", icon: <CheckCircle className="h-4 w-4" />, color: "green" },
                      { value: "completed", label: "Concluído", icon: <Check className="h-4 w-4" />, color: "gray" },
                      { value: "cancelled", label: "Cancelado", icon: <XCircle className="h-4 w-4" />, color: "red" },
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
                            <div className="font-medium text-gray-900">{status.label}</div>
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
        <EditConsultationModal
          isOpen={showEditModal}
          consultation={consultationToEdit}
          onClose={closeEditModal}
          onSuccess={handleEditSuccess}
        />

        {/* Cancel Consultation Modal */}
        <CancelConsultationModal
          isOpen={showCancelModal}
          onClose={closeModals}
          onConfirm={handleCancelConsultation}
          consultationData={selectedConsultation ? {
            id: selectedConsultation.id,
            patient_name: selectedConsultation.client_name,
            service_name: selectedConsultation.service_name,
            date: selectedConsultation.date,
            professional_name: user?.name || '',
            location_name: selectedConsultation.location_name || '',
            is_dependent: selectedConsultation.is_dependent,
            patient_type: selectedConsultation.patient_type
          } : null}
        />

        {/* Slot Customization Modal */}
        <SlotCustomizationModal
          isOpen={showSlotModal}
          currentSlotDuration={slotDuration}
          onClose={() => setShowSlotModal(false)}
          onSlotDurationChange={handleSlotDurationChange}
        />


        {/* Quick Schedule Modal */}
        {showQuickScheduleModal && (
          <QuickScheduleModal
            isOpen={showQuickScheduleModal}
            onClose={closeQuickScheduleModal}
            onSuccess={handleQuickScheduleSuccess}
            selectedSlot={selectedSlot}
          />
        )}

        {/* Recurring Consultation Modal */}
        {showRecurringModal && (
          <RecurringConsultationModal
            isOpen={showRecurringModal}
            onClose={() => setShowRecurringModal(false)}
            onSuccess={() => {
              fetchData();
              setSuccess("Consultas recorrentes criadas com sucesso!");
              setTimeout(() => setSuccess(""), 3000);
            }}
          />
        )}

      </div>
    );
  }

  // Fallback loading state
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando agenda...</p>
      </div>
    </div>
  );
};

export default SchedulingPage;