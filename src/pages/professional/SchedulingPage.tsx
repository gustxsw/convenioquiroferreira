import type React from "react";
import { useState, useEffect, useRef } from "react";
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
  Edit,
  MessageCircle,
  Settings,
  Repeat,
  Gift,
  Search,
  Lock,
  Unlock,
  CalendarClock,
  Video,
} from "lucide-react";
import {
  format,
  addDays,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  getDay,
  getDaysInMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import CancelConsultationModal from "../../components/CancelConsultationModal";
import EditConsultationModal from "../../components/EditConsultationModal";
import RescheduleConsultationModal from "../../components/RescheduleConsultationModal";
import SlotCustomizationModal from "../../components/SlotCustomizationModal";
import RecurringConsultationModal from "../../components/RecurringConsultationModal";
import SchedulingAccessPayment from "../../components/SchedulingAccessPayment";
import QuickScheduleModal from "../../components/QuickScheduleModal";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import { ls } from "../../utils/storage";
import { getProfessionalActorId } from "../../utils/professionalActor";
import { timeToMinutes, minutesToTime } from "../../utils/timeSlotValidation";

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
  google_meet_link?: string | null;
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

type BlockedSlot = {
  id: number;
  professional_id: number;
  date: string;
  time_slot: string;
  reason?: string;
  created_at: string;
};

const SchedulingPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [privatePatients, setPrivatePatients] = useState<PrivatePatient[]>([]);
  const [selectedPrivatePatient, setSelectedPrivatePatient] =
    useState<PrivatePatient | null>(null);
  const [attendanceLocations, setAttendanceLocations] = useState<
    AttendanceLocation[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Scheduling access state
  const [hasSchedulingAccess, setHasSchedulingAccess] = useState<
    boolean | null
  >(null);
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [paymentCheckMessage, setPaymentCheckMessage] = useState("");

  // Slot customization state
  const [slotDuration, setSlotDuration] = useState<SlotDuration>(() => {
    const saved = ls.get("scheduling-slot-duration");
    return saved ? (Number(saved) as SlotDuration) : 30;
  });
  // Working hours (expediente) — loaded from backend (GET /api/professional/working-hours)
  const [workingStart, setWorkingStart] = useState<string>("07:00");
  const [workingEnd, setWorkingEnd] = useState<string>("18:00");
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [showQuickScheduleModal, setShowQuickScheduleModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string;
    time: string;
  } | null>(null);

  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedConsultation, setSelectedConsultation] =
    useState<Consultation | null>(null);
  const [newStatus, setNewStatus] = useState<
    "scheduled" | "confirmed" | "completed" | "cancelled"
  >("scheduled");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [consultationToEdit, setConsultationToEdit] =
    useState<Consultation | null>(null);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [consultationToReschedule, setConsultationToReschedule] =
    useState<Consultation | null>(null);
  const [rescheduleDefaults, setRescheduleDefaults] = useState<{
    date: string;
    time: string;
  }>({ date: "", time: "" });
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Agenda redesign UI state
  const [viewTab, setViewTab] = useState<"horario" | "consultas">("horario");
  const [viewMode, setViewMode] = useState<"dia" | "semana" | "mes">("dia");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultView, setDefaultView] = useState<"dia" | "semana" | "mes">("dia");
  const [defaultDayTab, setDefaultDayTab] = useState<"horario" | "consultas">("horario");
  const [weekConsultations, setWeekConsultations] = useState<Record<string, Consultation[]>>({});
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    startOfMonth(new Date())
  );

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
    payment_method: "",
    convenio: "",
  });

  // Client search state
  const [clientSearchResult, setClientSearchResult] = useState<any>(null);
  const [dependents, setDependents] = useState<any[]>([]);
  const [selectedDependentId, setSelectedDependentId] = useState<number | null>(
    null
  );
  const [isSearching, setIsSearching] = useState(false);

  // Private patient search state
  const [privatePatientSearch, setPrivatePatientSearch] = useState("");
  const [showPrivatePatientDropdown, setShowPrivatePatientDropdown] =
    useState(false);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const privatePatientDropdownRef = useRef<HTMLDivElement>(null);
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


  // 🔥 FUNÇÃO ÚNICA PARA CONVERSÃO DE TIMEZONE
  const formatTime = (utcDateString: string): string => {
    return new Date(utcDateString).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  // Check for payment feedback on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get("payment");
    const paymentType = urlParams.get("type");

    if (paymentStatus === "success" && paymentType === "agenda") {
      console.log(
        "🎉 [SCHEDULING] Payment success detected, rechecking access..."
      );

      // Clear URL parameters
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
    if (
      paymentStatus === "success" &&
      (paymentType === "agenda" || !paymentType)
    ) {
      console.log(
        "🎉 [SCHEDULING] Payment success detected, rechecking access..."
      );
      setPaymentCheckMessage("Pagamento detectado! Verificando acesso...");
      setIsCheckingPayment(true);

      // Clear URL parameters
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);

      // Recheck access multiple times with increasing delays
      const recheckAccess = async (attempt = 1, maxAttempts = 5) => {
        console.log(
          `🔄 [SCHEDULING] Recheck attempt ${attempt}/${maxAttempts}`
        );

        try {
          const apiUrl = getApiUrl();

          const response = await fetchWithAuth(
            `${apiUrl}/api/professional/scheduling-access`
          );

          if (response.ok) {
            const accessData = await response.json();
            console.log(
              `✅ [SCHEDULING] Access check ${attempt} result:`,
              accessData
            );

            if (accessData.hasAccess) {
              setHasSchedulingAccess(true);
              setIsCheckingAccess(false);
              setIsCheckingPayment(false);
              setPaymentCheckMessage("Acesso ativado com sucesso! 🎉");

              // Clear success message after 3 seconds
              setTimeout(() => {
                setPaymentCheckMessage("");
              }, 3000);

              return;
            }
          }

          // If still no access and we have attempts left, try again
          if (attempt < maxAttempts) {
            const delay = attempt * 2000; // Increasing delay: 2s, 4s, 6s, 8s, 10s
            console.log(
              `⏳ [SCHEDULING] Waiting ${delay}ms before next attempt...`
            );
            setTimeout(() => recheckAccess(attempt + 1, maxAttempts), delay);
          } else {
            console.warn(
              "⚠️ [SCHEDULING] Max recheck attempts reached, access still not granted"
            );
            setIsCheckingPayment(false);
            setPaymentCheckMessage(
              "Pagamento processado, mas acesso ainda não ativado. Tente recarregar a página."
            );
          }
        } catch (error) {
          console.error(
            `❌ [SCHEDULING] Recheck attempt ${attempt} failed:`,
            error
          );
          if (attempt < maxAttempts) {
            setTimeout(() => recheckAccess(attempt + 1, maxAttempts), 2000);
          } else {
            setIsCheckingPayment(false);
            setPaymentCheckMessage(
              "Erro ao verificar acesso. Tente recarregar a página."
            );
          }
        }
      };

      // Start rechecking
      recheckAccess();
    }
  }, []);

  useEffect(() => {
    checkSchedulingAccess();
    fetchData();
  }, [selectedDate]);

  // Fetch consultations for week or month view
  useEffect(() => {
    if (viewMode === "dia") return;
    const fetchRangeData = async () => {
      try {
        const apiUrl = getApiUrl();
        let start: Date;
        let end: Date;
        if (viewMode === "semana") {
          start = startOfWeek(selectedDate, { weekStartsOn: 0 });
          end = endOfWeek(selectedDate, { weekStartsOn: 0 });
        } else {
          start = startOfMonth(selectedDate);
          end = endOfMonth(selectedDate);
        }
        const days: Date[] = [];
        let cur = start;
        while (cur <= end) {
          days.push(cur);
          cur = addDays(cur, 1);
        }
        const results = await Promise.all(
          days.map(async (d) => {
            const dateStr = format(d, "yyyy-MM-dd");
            try {
              const res = await fetchWithAuth(`${apiUrl}/api/consultations/agenda?date=${dateStr}`);
              if (res.ok) {
                const data = await res.json();
                return { dateStr, data: Array.isArray(data) ? data : [] };
              }
            } catch { /* silent */ }
            return { dateStr, data: [] };
          })
        );
        const map: Record<string, Consultation[]> = {};
        results.forEach(({ dateStr, data }) => { map[dateStr] = data; });
        setWeekConsultations(map);
      } catch { /* silent */ }
    };
    fetchRangeData();
  }, [viewMode, selectedDate]);

  // Atualização silenciosa: recarrega só as consultas e bloqueios do dia
  // selecionado, sem alternar o loading nem exibir erros. Usada pelo polling
  // para refletir agendamentos da Secretária Virtual (WhatsApp) em tempo real.
  const silentRefresh = async () => {
    try {
      const apiUrl = getApiUrl();
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const [consultationsResponse, blockedSlotsResponse] = await Promise.all([
        fetchWithAuth(`${apiUrl}/api/consultations/agenda?date=${dateStr}`, {
          headers: { "Content-Type": "application/json" },
        }),
        fetchWithAuth(`${apiUrl}/api/blocked-slots?date=${dateStr}`, {
          headers: { "Content-Type": "application/json" },
        }),
      ]);
      if (consultationsResponse.ok) {
        const data = await consultationsResponse.json();
        if (Array.isArray(data)) setConsultations(data);
      }
      if (blockedSlotsResponse.ok) {
        const data = await blockedSlotsResponse.json();
        setBlockedSlots(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silencioso: uma falha pontual de rede não deve poluir a agenda.
    }
  };

  // Auto-atualização da agenda enquanto a página está aberta, para que os
  // agendamentos feitos pelo WhatsApp apareçam sozinhos (ótimo em demonstrações
  // ao vivo). Só atualiza com a aba visível; e atualiza na hora ao reabrir a aba.
  useEffect(() => {
    if (!hasSchedulingAccess) return;
    const REFRESH_MS = 4000;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") silentRefresh();
    }, REFRESH_MS);
    const onFocus = () => silentRefresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, hasSchedulingAccess]);

  useEffect(() => {
    fetchWorkingHours();
  }, []);

  useEffect(() => {
    if (formData.patient_type !== "private") {
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
          `${apiUrl}/api/private-patients?q=${encodeURIComponent(searchTerm)}&limit=50`,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
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
  }, [privatePatientSearch, formData.patient_type]);

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

  const handlePrivatePatientSelect = (patient: PrivatePatient) => {
    setSelectedPrivatePatient(patient);
    setFormData((prev) => ({
      ...prev,
      private_patient_id: patient.id.toString(),
    }));
    setPrivatePatientSearch(patient.name);
    setShowPrivatePatientDropdown(false);
  };

  const checkSchedulingAccess = async () => {
    try {
      setIsCheckingAccess(true);
      setAccessError("");
      const apiUrl = getApiUrl();

      console.log("🔍 Checking scheduling access...");

      const response = await fetchWithAuth(
        `${apiUrl}/api/professional/scheduling-access`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const accessData = await response.json();
        console.log("✅ Access status received:", accessData);
        setHasSchedulingAccess(accessData.hasAccess);
        setAccessExpiresAt(accessData.expiresAt);
      } else {
        console.warn("⚠️ Access check failed:", response.status);
        setHasSchedulingAccess(false);
        setAccessExpiresAt(null);
      }
    } catch (error) {
      console.error("❌ Error checking access:", error);
      setAccessError("Erro ao verificar acesso à agenda");
      setHasSchedulingAccess(false);
      setAccessExpiresAt(null);
    } finally {
      setIsCheckingAccess(false);
    }
  };

  const handleEarlyRenewalPayment = async () => {
    try {
      setError("");
      setSuccess("");
      setPaymentCheckMessage("");
      setIsCheckingPayment(true);

      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/professional/create-agenda-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ duration_days: 30 }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || "Erro ao criar pagamento de renovação"
        );
      }

      const data = await response.json();
      setPaymentCheckMessage("Redirecionando para o pagamento...");

      // Redirect to MercadoPago
      window.location.href = data.init_point;
    } catch (err) {
      setIsCheckingPayment(false);
      setPaymentCheckMessage("");
      setError(err instanceof Error ? err.message : "Erro ao processar pagamento");
    }
  };
  // Handle slot duration change
  const handleSlotDurationChange = (duration: SlotDuration) => {
    setSlotDuration(duration);
    ls.set("scheduling-slot-duration", duration.toString());
  };

  // Load working hours (expediente) from backend
  const fetchWorkingHours = async () => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/professional/working-hours`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.start_time) setWorkingStart(data.start_time);
        if (data.end_time) setWorkingEnd(data.end_time);
      }
    } catch (error) {
      console.error("Error fetching working hours:", error);
    }
  };

  // Persist working hours (expediente) to backend
  const handleWorkingHoursChange = async (startTime: string, endTime: string) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/professional/working-hours`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start_time: startTime, end_time: endTime }),
        }
      );

      if (response.ok) {
        setWorkingStart(startTime);
        setWorkingEnd(endTime);
        setSuccess("Horário de trabalho atualizado com sucesso!");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || "Erro ao salvar horário de trabalho");
        setTimeout(() => setError(""), 3000);
      }
    } catch (error) {
      setError("Erro ao salvar horário de trabalho");
      setTimeout(() => setError(""), 3000);
    }
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
        date: format(selectedDate, "yyyy-MM-dd"),
        time: timeSlot,
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

  // Redesigned agenda theme (exact palette from the approved design)
  const getConsultationTheme = (consultation: Consultation) => {
    if (consultation.patient_type === "private") {
      return {
        rowBg: "#f7f2ff",
        border: "#9881c3",
        badgeBg: "#ede4fb",
        badgeText: "#4a2c86",
        iconColor: "#7c5bb8",
        label: "Particular",
      };
    }
    if (consultation.is_dependent) {
      return {
        rowBg: "#ebf7ff",
        border: "#6493c4",
        badgeBg: "#d6ecfb",
        badgeText: "#1a5c96",
        iconColor: "#3f83c4",
        label: "Dependente",
      };
    }
    return {
      rowBg: "#e8fbeb",
      border: "#3b9555",
      badgeBg: "#bce3c3",
      badgeText: "#1f6b38",
      iconColor: "#2f8a4e",
      label: "Titular",
    };
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError("");

      const apiUrl = getApiUrl();
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      console.log("🔄 [AGENDA] Fetching consultations for date:", dateStr);
      console.log("🔄 [AGENDA] Selected date object:", selectedDate);
      console.log("🔄 [AGENDA] Formatted date string:", dateStr);

      // Fetch consultations for the selected date
      const consultationsResponse = await fetchWithAuth(
        `${apiUrl}/api/consultations/agenda?date=${dateStr}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log(
        "📡 [AGENDA] Consultations response status:",
        consultationsResponse.status
      );

      if (consultationsResponse.status === 403) {
        // No scheduling access
        const errorData = await consultationsResponse.json();
        if (errorData.code === "NO_SCHEDULING_ACCESS") {
          console.log("❌ No scheduling access detected");
          setHasSchedulingAccess(false);
          setConsultations([]);
          return;
        }
      } else if (consultationsResponse.ok) {
        const consultationsData = await consultationsResponse.json();
        console.log(
          "✅ [AGENDA] Consultations loaded:",
          consultationsData.length
        );
        console.log("✅ [AGENDA] Consultations data:", consultationsData);

        // Debug each consultation's date
        consultationsData.forEach((consultation, index) => {
          console.log(`🔍 [AGENDA] Consultation ${index + 1}:`, {
            id: consultation.id,
            client_name: consultation.client_name,
            date: consultation.date,
            date_parsed: new Date(consultation.date),
            date_brazil: new Date(
              new Date(consultation.date).getTime() - 3 * 60 * 60 * 1000
            ),
            time_extracted: format(new Date(consultation.date), "HH:mm"),
          });
        });

        setConsultations(consultationsData);
      } else {
        const errorText = await consultationsResponse.text();
        console.error(
          "❌ [AGENDA] Consultations response error:",
          consultationsResponse.status,
          errorText
        );
        setConsultations([]);
      }

      // Fetch services
      const servicesResponse = await fetchWithAuth(`${apiUrl}/api/services`, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (servicesResponse.ok) {
        const servicesData = await servicesResponse.json();
        setServices(servicesData);
      }

      // Fetch private patients
      setPrivatePatients([]);
      setIsLoadingPatients(false);

      // Fetch attendance locations
      const locationsResponse = await fetchWithAuth(
        `${apiUrl}/api/attendance-locations`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        setAttendanceLocations(locationsData);
      }

      // Fetch blocked slots
      const blockedSlotsResponse = await fetchWithAuth(
        `${apiUrl}/api/blocked-slots?date=${dateStr}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (blockedSlotsResponse.ok) {
        const blockedSlotsData = await blockedSlotsResponse.json();
        setBlockedSlots(blockedSlotsData);
      } else {
        setBlockedSlots([]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setError("Erro ao carregar dados");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBlockSlot = async (timeSlot: string) => {
    try {
      const apiUrl = getApiUrl();
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const normalizeDate = (value: string) => value?.split("T")[0];

      // Check if slot is already blocked
      const existingBlock = blockedSlots.find(
        (slot) =>
          slot.time_slot === timeSlot && normalizeDate(slot.date) === dateStr
      );

      if (existingBlock) {
        // Unblock the slot
        const response = await fetchWithAuth(
          `${apiUrl}/api/blocked-slots/${existingBlock.id}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          setBlockedSlots((prev) =>
            prev.filter((slot) => slot.id !== existingBlock.id)
          );
          setSuccess("Horário desbloqueado com sucesso!");
          setTimeout(() => setSuccess(""), 2000);
        } else {
          setError("Erro ao desbloquear horário");
          setTimeout(() => setError(""), 3000);
        }
      } else {
        // Block the slot
        const response = await fetchWithAuth(
          `${apiUrl}/api/blocked-slots`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              date: dateStr,
              time_slot: timeSlot,
            }),
          }
        );

        if (response.ok) {
          const newBlockedSlot = await response.json();
          setBlockedSlots((prev) => [...prev, newBlockedSlot]);
          setSuccess("Horário bloqueado com sucesso!");
          setTimeout(() => setSuccess(""), 2000);
        } else {
          setError("Erro ao bloquear horário");
          setTimeout(() => setError(""), 3000);
        }
      }
    } catch (error) {
      console.error("Error toggling block slot:", error);
      setError("Erro ao processar bloqueio de horário");
      setTimeout(() => setError(""), 3000);
    }
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

  const searchClientByCpf = async () => {
    if (!formData.client_cpf) return;

    try {
      setIsSearching(true);
      setError("");

      const apiUrl = getApiUrl();
      const cleanCpf = formData.client_cpf.replace(/\D/g, "");

      // Search for client
      const clientResponse = await fetchWithAuth(
        `${apiUrl}/api/clients/lookup?cpf=${cleanCpf}`
      );

      if (clientResponse.ok) {
        const clientData = await clientResponse.json(); // **FIXED: Changed 'response' to 'clientResponse'**

        if (clientData.subscription_status !== "active") {
          setError("Cliente não possui assinatura ativa");
          return;
        }

        setClientSearchResult(clientData);

        // Fetch dependents
        const dependentsResponse = await fetchWithAuth(
          `${apiUrl}/api/dependents?client_id=${clientData.id}&status=active`
        );

        if (dependentsResponse.ok) {
          const dependentsData = await dependentsResponse.json();
          setDependents(dependentsData);
        }
      } else {
        // Try searching as dependent
        const dependentResponse = await fetchWithAuth(
          `${apiUrl}/api/dependents/search?cpf=${cleanCpf}`
        );

        if (dependentResponse.ok) {
          const dependentData = await dependentResponse.json(); // **FIXED: Changed 'response' to 'dependentResponse'**

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
      const apiUrl = getApiUrl();

      // Create single consultation only (recurring moved to separate modal)
      const consultationData: any = {
        professional_id: getProfessionalActorId(user),
        service_id: Number.parseInt(formData.service_id),
        location_id: formData.location_id
          ? Number.parseInt(formData.location_id)
          : null,
        value: Number.parseFloat(formData.value),
        date: `${formData.date}T${formData.time}`,
        status: "scheduled",
        notes: formData.notes || null,
        payment_method: formData.payment_method || null,
        convenio: formData.convenio.trim() || null,
      };

      // Set patient based on type
      if (formData.patient_type === "private") {
        consultationData.private_patient_id = Number.parseInt(
          formData.private_patient_id || ""
        );
      } else {
        if (selectedDependentId) {
          consultationData.dependent_id = selectedDependentId;
        } else {
          consultationData.user_id = clientSearchResult?.id;
        }
      }

      console.log("🔄 Single consultation data:", consultationData);
      const response = await fetchWithAuth(`${apiUrl}/api/consultations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(consultationData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ Single consultation error:", errorData);
        if (response.status === 409 && errorData.conflict) {
          setError(
            errorData.message ||
              "Este horário já está ocupado. Por favor, escolha outro horário."
          );
        } else {
          setError(errorData.message || "Falha ao criar consulta");
        }
        return;
      }

      setSuccess("Consulta criada com sucesso!");

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
      payment_method: "",
      convenio: "",
    });
    setClientSearchResult(null);
    setDependents([]);
    setSelectedDependentId(null);
    setShowQuickPrivatePatientModal(false);
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

      const apiUrl = getApiUrl();

      const response = await fetchWithAuth(
        `${apiUrl}/api/consultations/${selectedConsultation.id}/status`,
        {
          method: "PUT",
          headers: {
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

  const openRescheduleModal = (
    consultation: Consultation,
    displayTime: string
  ) => {
    setConsultationToReschedule(consultation);
    // Usa a data/hora EXIBIDAS (as mesmas que aparecem na agenda), evitando
    // reconversão de fuso. displayTime é o slot da linha; a data é a do dia aberto.
    setRescheduleDefaults({
      date: format(selectedDate, "yyyy-MM-dd"),
      time: displayTime,
    });
    setShowRescheduleModal(true);
  };

  const closeRescheduleModal = () => {
    setShowRescheduleModal(false);
    setConsultationToReschedule(null);
  };

  const handleRescheduleSuccess = () => {
    fetchData();
    setSuccess("Consulta remarcada com sucesso!");
    setTimeout(() => setSuccess(""), 3000);
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
      const apiUrl = getApiUrl();

      const response = await fetchWithAuth(
        `${apiUrl}/api/consultations/${selectedConsultation.id}/cancel`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cancellation_reason: reason || null,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao cancelar consulta");
      }

      await fetchData();
      setSuccess(
        "Consulta cancelada com sucesso! Horário liberado para novos agendamentos."
      );
      setTimeout(() => setSuccess(""), 5000);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Erro ao cancelar consulta"
      );
    }
  };

  const openWhatsApp = async (consultation: Consultation) => {
    try {
      const apiUrl = getApiUrl();

      const response = await fetchWithAuth(
        `${apiUrl}/api/consultations/${consultation.id}/whatsapp`
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
  const delay = 3000; // 3 seconds between attempts
  const generateTimeSlots = (
    duration = 30,
    startTime = "07:00",
    endTime = "18:00"
  ) => {
    const slots = [];
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    for (let minutes = startMinutes; minutes < endMinutes; minutes += duration) {
      slots.push(minutesToTime(minutes));
    }
    return slots;
  };

  const timeSlots = generateTimeSlots(slotDuration, workingStart, workingEnd);

  const consultationsByTime = consultations.reduce((acc, consultation) => {
    acc[formatTime(consultation.date)] = consultation;
    return acc;
  }, {} as Record<string, Consultation>);

  // Group blocked slots by time
  const blockedSlotsByTime = blockedSlots.reduce((acc, slot) => {
    acc[slot.time_slot] = slot;
    return acc;
  }, {} as Record<string, BlockedSlot>);

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
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Erro de Conexão
          </h3>
          <p className="text-gray-600 mb-4">{accessError}</p>
          <button onClick={checkSchedulingAccess} className="btn btn-primary">
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
        professionalName={user?.name || "Profissional"}
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
        professionalName={user?.name || "Profissional"}
        onPaymentSuccess={() => {
          // Refresh access status after payment
          checkSchedulingAccess();
        }}
      />
    );
  }

  // Main agenda interface (only shown when access is confirmed)
  if (hasSchedulingAccess === true) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysUntilExpiry =
      accessExpiresAt != null
        ? Math.ceil(
            (new Date(accessExpiresAt).getTime() - new Date().getTime()) /
              msPerDay
          )
        : null;
    const canRenewEarly =
      daysUntilExpiry != null && daysUntilExpiry > 0 && daysUntilExpiry <= 7;

    // Mini-calendário: monta a grade do mês (com deslocamento do 1º dia)
    const daysInMonth = getDaysInMonth(calendarMonth);
    const firstWeekday = getDay(startOfMonth(calendarMonth)); // 0 = domingo
    const calendarDays: (Date | null)[] = [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from(
        { length: daysInMonth },
        (_, i) =>
          new Date(
            calendarMonth.getFullYear(),
            calendarMonth.getMonth(),
            i + 1
          )
      ),
    ];

    // Próxima consulta do dia (a partir de agora, se for hoje)
    const bookedTimes = Object.keys(consultationsByTime).sort();
    const isViewingToday = isSameDay(selectedDate, new Date());
    const nowHHmm = format(new Date(), "HH:mm");
    const nextConsultationTime = isViewingToday
      ? bookedTimes.find((t) => t >= nowHHmm) ?? bookedTimes[0] ?? null
      : bookedTimes[0] ?? null;

    return (
      <div className="min-h-screen bg-[#f8f4f3] -mx-2 sm:-mx-4 lg:-mx-6 px-3 sm:px-5 lg:px-8 py-4 sm:py-6">
        {/* Access Status Banner */}
        {hasSchedulingAccess && accessExpiresAt && (
          <div className="bg-green-50 border-l-4 border-green-600 p-3 sm:p-4 mb-4 sm:mb-6">
            <div className="flex items-center">
              <Gift className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 mr-2" />
              <div>
                <p className="text-sm sm:text-base text-green-700 font-medium">
                  Acesso à agenda ativo
                </p>
                <p className="text-xs sm:text-sm text-green-600">
                  Válido até:{" "}
                  {new Date(accessExpiresAt).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                {canRenewEarly && (
                  <div className="mt-2">
                    <button
                      onClick={handleEarlyRenewalPayment}
                      className="btn btn-outline btn-sm"
                      disabled={isCheckingPayment}
                    >
                      {isCheckingPayment ? "Processando..." : "Renovar agora"}
                    </button>
                    <p className="text-[11px] sm:text-xs text-green-700 mt-1">
                      Renovação antecipada disponível (faltam {daysUntilExpiry}{" "}
                      dia(s) para vencer). O novo ciclo começa após o vencimento
                      atual.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-5 lg:gap-6 items-start">
          {/* ===== Coluna principal ===== */}
          <div className="flex-1 min-w-0 w-full">
            <div className="mb-4 sm:mb-5">
              <h1 className="text-2xl sm:text-[26px] font-bold text-[#26201f] tracking-tight">
                Agenda
              </h1>
              <p className="text-sm text-[#585454] mt-0.5">
                Visualize e gerencie suas consultas
              </p>
            </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 flex items-center text-sm sm:text-base">
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-green-50 text-green-600 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 flex items-center text-sm sm:text-base">
            <Check className="h-4 w-4 sm:h-5 sm:w-5 mr-2 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Faixa de dias — mobile/tablet apenas */}
        <div className="lg:hidden mb-4">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectedDate(subDays(selectedDate, 7))}
              className="p-2 rounded-lg text-[#585454] hover:bg-black/5 transition-colors flex-shrink-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 flex gap-1 overflow-x-auto no-scrollbar">
              {Array.from({ length: 7 }, (_, i) => {
                const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
                const day = addDays(weekStart, i);
                const isSel = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(day)}
                    className={`flex flex-col items-center flex-shrink-0 w-11 py-2 rounded-xl text-xs font-semibold transition-colors ${
                      isSel
                        ? "text-white"
                        : isToday
                        ? "text-[#b32228] hover:bg-black/5"
                        : "text-[#585454] hover:bg-black/5"
                    }`}
                    style={isSel ? { background: "#b32228" } : undefined}
                  >
                    <span className="text-[10px] uppercase">
                      {format(day, "EEE", { locale: ptBR })}
                    </span>
                    <span className="text-base leading-tight">{day.getDate()}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, 7))}
              className="p-2 rounded-lg text-[#585454] hover:bg-black/5 transition-colors flex-shrink-0"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Barra de data + ações */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                if (viewMode === "dia") setSelectedDate(subDays(selectedDate, 1));
                else if (viewMode === "semana") setSelectedDate(subDays(selectedDate, 7));
                else setSelectedDate(subMonths(selectedDate, 1));
              }}
              className="p-1.5 rounded-lg text-[#585454] hover:bg-black/5 transition-colors"
              title="Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[#26201f] leading-tight first-letter:uppercase">
                {viewMode === "dia"
                  ? format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })
                  : viewMode === "semana"
                  ? (() => {
                      const ws = startOfWeek(selectedDate, { weekStartsOn: 0 });
                      const we = endOfWeek(selectedDate, { weekStartsOn: 0 });
                      return isSameMonth(ws, we)
                        ? `${format(ws, "dd")} – ${format(we, "dd 'de' MMMM", { locale: ptBR })}`
                        : `${format(ws, "dd 'de' MMM", { locale: ptBR })} – ${format(we, "dd 'de' MMM", { locale: ptBR })}`;
                    })()
                  : format(selectedDate, "MMMM yyyy", { locale: ptBR })}
              </h2>
              <p className="text-xs text-[#747070] mt-0.5">
                {viewMode === "dia"
                  ? `Slots de ${slotDuration} min · ${consultations.length} ${consultations.length === 1 ? "consulta" : "consultas"} hoje`
                  : viewMode === "semana"
                  ? `${Object.values(weekConsultations).reduce((s, a) => s + a.length, 0)} consultas na semana`
                  : `${Object.values(weekConsultations).reduce((s, a) => s + a.length, 0)} consultas no mês`}
              </p>
            </div>
            <button
              onClick={() => {
                if (viewMode === "dia") setSelectedDate(addDays(selectedDate, 1));
                else if (viewMode === "semana") setSelectedDate(addDays(selectedDate, 7));
                else setSelectedDate(addMonths(selectedDate, 1));
              }}
              className="p-1.5 rounded-lg text-[#585454] hover:bg-black/5 transition-colors"
              title="Próximo"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto sm:flex-shrink-0 flex-wrap">
            {/* View mode tabs */}
            <div className="flex bg-white border border-[#e2dedc] rounded-xl p-1 gap-0.5">
              {(["dia", "semana", "mes"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${
                    viewMode === v ? "bg-[#b32228] text-white" : "text-[#585454] hover:bg-black/5"
                  }`}
                >
                  {v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Mês"}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowRecurringModal(true)}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-[#d1cdcc] bg-white text-[13px] font-semibold text-[#35302f] hover:bg-[#faf8f7] transition-colors sm:flex-none"
            >
              <Repeat className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Recorrentes</span>
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg bg-[#b32228] text-[13px] font-bold text-white hover:bg-[#9c1d22] transition-colors shadow-sm sm:flex-none whitespace-nowrap"
            >
              <Plus className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Agendar Consulta</span>
              <span className="sm:hidden">Agendar</span>
            </button>
          </div>
        </div>

        {/* Legenda inline */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-3 text-xs text-[#585454]">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: "#3b9555" }}
            />
            Cliente Titular
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: "#6493c4" }}
            />
            Dependente
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: "#9881c3" }}
            />
            Particular
          </span>
        </div>

        {/* Cartão da agenda */}
        <div className="bg-white rounded-xl border border-[#e4e0e0] shadow-[0_2px_10px_rgba(60,40,30,0.05)] overflow-hidden">
          {/* Abas — ocultas no mobile (sempre mostra só consultas) */}
          <div className="hidden sm:flex items-center border-b border-[#efeceb] px-2">
            <button
              onClick={() => setViewTab("horario")}
              className={`relative px-4 py-3 text-sm font-semibold transition-colors ${
                viewTab === "horario"
                  ? "text-[#26201f]"
                  : "text-[#8b8785] hover:text-[#585454]"
              }`}
            >
              HORÁRIO
              {viewTab === "horario" && (
                <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-[#b32228]" />
              )}
            </button>
            <button
              onClick={() => setViewTab("consultas")}
              className={`relative px-4 py-3 text-sm font-semibold transition-colors ${
                viewTab === "consultas"
                  ? "text-[#26201f]"
                  : "text-[#8b8785] hover:text-[#585454]"
              }`}
            >
              CONSULTAS
              {viewTab === "consultas" && (
                <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-[#b32228]" />
              )}
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="ml-auto mr-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-[#8b8785] hover:text-[#585454] hover:bg-black/5 transition-colors"
              title="Configurações da agenda"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {getSlotDurationLabel(slotDuration)}
              </span>
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Carregando agenda...</p>
            </div>
          ) : viewMode === "semana" ? (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-7 min-w-[560px]">
                {(() => {
                  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
                  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
                  return days.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const dayConsultations = weekConsultations[dateStr] || [];
                    const isToday = isSameDay(day, new Date());
                    const isSel = isSameDay(day, selectedDate);
                    return (
                      <div
                        key={dateStr}
                        className="border-r border-[#f0eeed] last:border-r-0 cursor-pointer"
                        onClick={() => { setSelectedDate(day); setViewMode("dia"); }}
                      >
                        <div
                          className={`text-center py-2 text-xs font-bold border-b border-[#f0eeed] ${
                            isToday ? "text-[#b32228]" : isSel ? "text-[#b32228]" : "text-[#585454]"
                          }`}
                          style={isToday ? { background: "#fff5f5" } : undefined}
                        >
                          <div className="uppercase text-[10px]">
                            {format(day, "EEE", { locale: ptBR })}
                          </div>
                          <div
                            className={`text-base mx-auto w-7 h-7 rounded-full flex items-center justify-center ${
                              isToday ? "bg-[#b32228] text-white" : ""
                            }`}
                          >
                            {day.getDate()}
                          </div>
                        </div>
                        <div className="p-1 space-y-1 min-h-[120px]">
                          {dayConsultations.length === 0 ? (
                            <p className="text-[10px] text-[#cfcac8] italic text-center mt-3">Livre</p>
                          ) : (
                            dayConsultations.map((c) => {
                              const theme = getConsultationTheme(c);
                              return (
                                <div
                                  key={c.id}
                                  className="rounded px-1.5 py-1 text-[10px] font-medium truncate"
                                  style={{ background: theme.badgeBg, color: theme.badgeText, borderLeft: `3px solid ${theme.border}` }}
                                  title={`${c.client_name} — ${c.service_name}`}
                                >
                                  <div className="font-semibold truncate">{formatTime(c.date)}</div>
                                  <div className="truncate">{c.client_name}</div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          ) : viewMode === "mes" ? (
            <div className="p-4">
              {(() => {
                const monthStart = startOfMonth(selectedDate);
                const monthEnd = endOfMonth(selectedDate);
                const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
                const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
                const gridDays: (Date | null)[] = [];
                let cur = gridStart;
                while (cur <= gridEnd) { gridDays.push(cur); cur = addDays(cur, 1); }
                return (
                  <>
                    <div className="grid grid-cols-7 mb-1">
                      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                        <div key={d} className="text-[11px] font-semibold text-[#8b8785] text-center py-1">{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {gridDays.map((day, idx) => {
                        if (!day) return <div key={`e-${idx}`} />;
                        const dateStr = format(day, "yyyy-MM-dd");
                        const dayConsults = weekConsultations[dateStr] || [];
                        const isToday = isSameDay(day, new Date());
                        const isCurMonth = isSameMonth(day, selectedDate);
                        return (
                          <div
                            key={dateStr}
                            onClick={() => { setSelectedDate(day); setViewMode("dia"); }}
                            className={`rounded-lg p-1.5 cursor-pointer border transition-colors min-h-[64px] ${
                              isToday
                                ? "border-[#b32228] bg-red-50"
                                : isCurMonth
                                ? "border-[#f0eeed] hover:border-[#d4cfce] bg-white"
                                : "border-transparent bg-[#faf8f7] opacity-50"
                            }`}
                          >
                            <div className={`text-xs font-bold mb-1 ${isToday ? "text-[#b32228]" : isCurMonth ? "text-[#26201f]" : "text-[#a8a4a2]"}`}>
                              {day.getDate()}
                            </div>
                            <div className="flex flex-wrap gap-0.5">
                              {dayConsults.slice(0, 3).map((c) => {
                                const theme = getConsultationTheme(c);
                                return (
                                  <span
                                    key={c.id}
                                    className="w-2 h-2 rounded-full"
                                    style={{ background: theme.border }}
                                    title={c.client_name}
                                  />
                                );
                              })}
                            </div>
                            {dayConsults.length > 0 && (
                              <div className="text-[9px] text-[#747070] mt-0.5 font-medium">
                                {dayConsults.length} consulta{dayConsults.length > 1 ? "s" : ""}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div>
              {(() => {
                const rows =
                  viewTab === "horario" && !isMobile
                    ? timeSlots
                    : timeSlots.filter((t) => !!consultationsByTime[t]);

                if (rows.length === 0) {
                  return (
                    <div className="text-center py-14 px-4">
                      <Calendar className="h-12 w-12 text-[#cfcac8] mx-auto mb-3" />
                      <h3 className="text-base font-semibold text-[#26201f] mb-1">
                        {viewTab === "consultas"
                          ? "Nenhuma consulta agendada"
                          : "Nenhum horário disponível"}
                      </h3>
                      <p className="text-sm text-[#747070]">
                        Sua agenda está livre para{" "}
                        {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="divide-y divide-[#f0eeed]">
                    {rows.map((timeSlot) => {
                      const consultation = consultationsByTime[timeSlot];
                      const blockedSlot = blockedSlotsByTime[timeSlot];
                      const isBlocked = !!blockedSlot;
                      const theme = consultation
                        ? getConsultationTheme(consultation)
                        : null;

                      return (
                        <div
                          key={timeSlot}
                          onClick={() => {
                            if (!consultation && !isBlocked) {
                              handleSlotClick(timeSlot);
                            }
                          }}
                          className={`flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-4 px-3 sm:px-5 py-3 transition-colors ${
                            consultation
                              ? ""
                              : isBlocked
                              ? "bg-[#f5f3f2]"
                              : "hover:bg-[#faf8f7] cursor-pointer"
                          }`}
                          style={
                            consultation && theme
                              ? {
                                  background: theme.rowBg,
                                  borderLeft: `4px solid ${theme.border}`,
                                }
                              : isBlocked
                              ? { borderLeft: "4px solid #cfcac8" }
                              : { borderLeft: "4px solid transparent" }
                          }
                          title={
                            consultation
                              ? "Use o botão de edição para editar"
                              : isBlocked
                              ? "Horário bloqueado"
                              : "Clique para agendar"
                          }
                        >
                          {/* Horário */}
                          <div className="w-11 sm:w-14 flex-shrink-0 text-sm font-bold text-[#26201f] tabular-nums">
                            {timeSlot}
                          </div>

                          {consultation && theme ? (
                            <>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-[#26201f] text-sm truncate">
                                    {consultation.client_name}
                                  </span>
                                  <span
                                    className="px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
                                    style={{
                                      background: theme.badgeBg,
                                      color: theme.badgeText,
                                    }}
                                  >
                                    {theme.label}
                                  </span>
                                </div>
                                <div className="text-xs text-[#747070] mt-0.5 truncate">
                                  {consultation.service_name}
                                  {" · "}
                                  {formatCurrency(consultation.value)}
                                  {consultation.location_name
                                    ? ` · ${consultation.location_name}`
                                    : ""}
                                </div>
                                {consultation.notes && (
                                  <div className="text-xs text-[#8b8785] italic mt-0.5 truncate">
                                    "{consultation.notes}"
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1 sm:gap-1.5 w-full sm:w-auto justify-end sm:flex-shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openWhatsApp(consultation);
                                  }}
                                  className="p-1.5 text-[#3b9555] hover:bg-black/5 rounded-lg transition-colors"
                                  title="Enviar mensagem no WhatsApp"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                </button>
                                {consultation.google_meet_link && (
                                  <a
                                    href={consultation.google_meet_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Entrar no Google Meet"
                                  >
                                    <Video className="h-4 w-4" />
                                  </a>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openRescheduleModal(consultation, timeSlot);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border border-[#d1cdcc] text-[#585454] hover:bg-black/5 transition-colors"
                                  title="Remarcar consulta (mudar data/horário)"
                                >
                                  <CalendarClock className="h-3.5 w-3.5" />
                                  Remarcar
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditModal(consultation);
                                  }}
                                  className="p-1.5 text-[#585454] hover:bg-black/5 rounded-lg transition-colors"
                                  title="Editar consulta"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openStatusModal(consultation);
                                  }}
                                  className={`inline-flex px-2.5 py-1.5 rounded-full text-xs font-bold items-center gap-1 border transition-all hover:shadow-sm ${
                                    getStatusInfo(consultation.status).className
                                  }`}
                                  title="Clique para alterar o status"
                                >
                                  {getStatusInfo(consultation.status).text}
                                </button>
                              </div>
                            </>
                          ) : isBlocked ? (
                            <>
                              <div className="flex-1 min-w-0 flex items-center gap-1.5 text-sm text-[#8b8785] italic">
                                <Lock className="h-3.5 w-3.5 flex-shrink-0" />
                                Horário bloqueado
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBlockSlot(timeSlot);
                                }}
                                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d1cdcc] bg-white text-xs font-medium text-[#585454] hover:bg-[#faf8f7] transition-colors"
                                title="Desbloquear horário"
                              >
                                <Unlock className="h-3.5 w-3.5" />
                                Desbloquear
                              </button>
                            </>
                          ) : (
                            <>
                              <div className="flex-1 min-w-0 text-sm italic text-[#a8a4a2]">
                                + Clique para agendar
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBlockSlot(timeSlot);
                                }}
                                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#d1cdcc] bg-white text-xs font-medium text-[#585454] hover:bg-[#faf8f7] transition-colors"
                                title="Bloquear horário"
                              >
                                Bloquear
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* ===== Settings Modal ===== */}
        {settingsOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSettingsOpen(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-[#26201f]">Configurações da Agenda</h2>
                <button onClick={() => setSettingsOpen(false)} className="p-1.5 rounded-lg text-[#8b8785] hover:bg-black/5"><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-[#35302f] mb-2">Visualização padrão</label>
                  <div className="flex gap-2">
                    {(["dia", "semana", "mes"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setDefaultView(v)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${defaultView === v ? "bg-[#b32228] text-white border-[#b32228]" : "border-[#e2dedc] text-[#585454] hover:bg-black/5"}`}
                      >
                        {v === "dia" ? "Dia" : v === "semana" ? "Semana" : "Mês"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#35302f] mb-2">Ao abrir visão Dia, mostrar</label>
                  <div className="flex gap-2">
                    {(["horario", "consultas"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setDefaultDayTab(v)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${defaultDayTab === v ? "bg-[#b32228] text-white border-[#b32228]" : "border-[#e2dedc] text-[#585454] hover:bg-black/5"}`}
                      >
                        {v === "horario" ? "Horário" : "Consultas"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#35302f] mb-2">Tamanho dos slots</label>
                  <div className="flex gap-2">
                    {([15, 30, 60] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => handleSlotDurationChange(d)}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${slotDuration === d ? "bg-[#b32228] text-white border-[#b32228]" : "border-[#e2dedc] text-[#585454] hover:bg-black/5"}`}
                      >
                        {d} min
                      </button>
                    ))}
                  </div>
                </div>
                <div className="border-t border-[#f0eeed] pt-4">
                  <label className="block text-sm font-semibold text-[#35302f] mb-1">Integração Google</label>
                  <p className="text-xs text-[#747070] mb-3">Sincronize consultas com o Google Agenda e gere links do Google Meet.</p>
                  <button
                    onClick={() => { setSettingsOpen(false); window.location.href = "/professional/profile"; }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#e2dedc] text-sm text-[#585454] hover:bg-black/5 transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    Gerenciar no Perfil
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== Fim da coluna principal ===== */}
        </div>

        {/* ===== Barra lateral: calendário + resumo — desktop apenas, somente na view Dia ===== */}
        <aside className={`lg:w-[320px] flex-shrink-0 space-y-4 ${viewMode === "dia" ? "hidden lg:block" : "hidden"}`}>
          {/* Mini calendário */}
          <div className="bg-white rounded-xl border border-[#e4e0e0] shadow-[0_2px_10px_rgba(60,40,30,0.05)] p-4">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                className="p-1.5 rounded-lg text-[#585454] hover:bg-black/5 transition-colors"
                title="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-bold text-[#26201f] capitalize">
                {format(calendarMonth, "MMMM yyyy", { locale: ptBR })}
              </span>
              <button
                onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                className="p-1.5 rounded-lg text-[#585454] hover:bg-black/5 transition-colors"
                title="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 mb-1">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
                <div
                  key={i}
                  className="text-[11px] font-semibold text-[#8b8785] text-center py-1"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {calendarDays.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} />;
                const isSel = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                return (
                  <div key={idx} className="flex justify-center">
                    <button
                      onClick={() => {
                        setSelectedDate(day);
                        if (!isSameMonth(day, calendarMonth)) {
                          setCalendarMonth(startOfMonth(day));
                        }
                      }}
                      className={`h-8 w-8 rounded-md text-[13px] flex items-center justify-center transition-colors ${
                        isSel
                          ? "text-white font-bold"
                          : isToday
                          ? "font-bold text-[#b32228] hover:bg-black/5"
                          : "text-[#35302f] hover:bg-black/5"
                      }`}
                      style={isSel ? { background: "#b32228" } : undefined}
                    >
                      {day.getDate()}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Resumo do dia */}
          <div className="bg-white rounded-xl border border-[#e4e0e0] shadow-[0_2px_10px_rgba(60,40,30,0.05)] p-4">
            <h3 className="text-sm font-bold text-[#26201f] mb-3">
              Resumo do dia
            </h3>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-[#585454]">Ocupação</span>
              <span className="text-sm font-bold text-[#b32228]">
                {consultations.length}/{timeSlots.length}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[#eeeae9] overflow-hidden mb-4">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${
                    timeSlots.length
                      ? Math.min(
                          100,
                          (consultations.length / timeSlots.length) * 100
                        )
                      : 0
                  }%`,
                  background: "#b32228",
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#585454]">Próxima consulta</span>
              <span className="text-sm font-bold text-[#26201f] tabular-nums">
                {nextConsultationTime ?? "—"}
              </span>
            </div>
          </div>
        </aside>
        </div>
        {/* ===== Fim do layout de duas colunas ===== */}

        {/* New Consultation Modal */}
        {showNewModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg sm:text-xl font-bold flex items-center">
                    <Plus className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 mr-2" />
                    Nova Consulta
                  </h2>
                  <button
                    onClick={() => setShowNewModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5 sm:h-6 sm:w-6" />
                  </button>
                </div>
              </div>

              <form onSubmit={createConsultation} className="p-4 sm:p-6">
                <div className="space-y-4 sm:space-y-6">
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
                          patient_type: e.target.value as
                            | "convenio"
                            | "private",
                          client_cpf: "",
                          private_patient_id: "",
                        }));
                        setPrivatePatientSearch("");
                        setShowPrivatePatientDropdown(false);
                        setSelectedPrivatePatient(null);
                        setClientSearchResult(null);
                        setDependents([]);
                        setSelectedDependentId(null);
                      }}
                      className="input text-sm sm:text-base"
                      required
                    >
                      <option value="private">Paciente Particular</option>
                      <option value="convenio">Cliente do Convênio</option>
                    </select>
                  </div>

                  {/* Private Patient Selection */}
                  {formData.patient_type === "private" && (
                    <div className="relative" ref={privatePatientDropdownRef}>
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
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm sm:text-base"
                            placeholder="Digite o nome ou CPF do paciente..."
                            required={!formData.private_patient_id}
                          />
                        </div>

                        {showPrivatePatientDropdown && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {isLoadingPatients ? (
                              <div className="p-4 text-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600 mx-auto mb-2"></div>
                                <p className="text-xs sm:text-sm text-gray-500">
                                  Carregando pacientes...
                                </p>
                              </div>
                            ) : privatePatientSearch.trim() === "" ? (
                              <div className="p-4 text-center">
                                <p className="text-xs sm:text-sm text-gray-500">
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
                                  <div className="font-medium text-gray-900 text-sm sm:text-base">
                                    {patient.name}
                                  </div>
                                  <div className="text-xs sm:text-sm text-gray-500">
                                    {patient.cpf
                                      ? formatCpf(patient.cpf)
                                      : "CPF não informado"}
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="p-4 text-center">
                                <p className="text-xs sm:text-sm text-gray-500 mb-2">
                                  Nenhum paciente encontrado com esse termo
                                </p>
                                <button
                                  type="button"
                                  onClick={openQuickPrivatePatientModal}
                                  className="mt-2 px-3 py-2 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700"
                                >
                                  Cadastrar Novo Paciente
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {formData.private_patient_id && (
                        <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200 flex items-center justify-between">
                          <div className="flex items-center">
                            <User className="h-4 w-4 text-green-600 mr-2" />
                            <span className="text-xs sm:text-sm font-medium text-green-800">
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

                  {/* Convenio Client Search */}
                  {formData.patient_type === "convenio" && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        CPF do Cliente *
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={formatCpf(formData.client_cpf)}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              client_cpf: e.target.value.replace(/\D/g, ""),
                            }))
                          }
                          className="input flex-1 text-sm sm:text-base"
                          placeholder="000.000.000-00"
                        />
                        <button
                          type="button"
                          onClick={searchClientByCpf}
                          className="btn btn-secondary text-sm sm:text-base whitespace-nowrap"
                          disabled={isSearching}
                        >
                          {isSearching ? "Buscando..." : "Buscar"}
                        </button>
                      </div>

                      {/* Client Search Result */}
                      {clientSearchResult && (
                        <div className="mt-3 p-3 bg-green-50 rounded-lg">
                          <p className="text-sm sm:text-base font-medium text-green-800">
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
                                    e.target.value
                                      ? Number(e.target.value)
                                      : null
                                  )
                                }
                                className="input text-sm sm:text-base"
                              >
                                <option value="">
                                  Consulta para o titular
                                </option>
                                {dependents.map((dependent) => (
                                  <option
                                    key={dependent.id}
                                    value={dependent.id}
                                  >
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
                  <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border border-blue-200">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center">
                        <Repeat className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 mr-2 flex-shrink-0" />
                        <span className="text-sm sm:text-base font-medium text-blue-900">
                          Consultas Recorrentes
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNewModal(false);
                          setShowRecurringModal(true);
                        }}
                        className="btn btn-secondary flex items-center justify-center text-sm sm:text-base"
                      >
                        <Repeat className="h-4 w-4 mr-2" />
                        Abrir Modal Recorrente
                      </button>
                    </div>
                    <p className="text-xs sm:text-sm text-blue-700 mt-2">
                      Para criar múltiplas consultas com padrão de repetição,
                      use o modal dedicado.
                    </p>
                  </div>

                  {/* Date and Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        className="input text-sm sm:text-base"
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
                          setFormData((prev) => ({
                            ...prev,
                            time: e.target.value,
                          }))
                        }
                        className="input text-sm sm:text-base"
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
                      className="input text-sm sm:text-base"
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
                        setFormData((prev) => ({
                          ...prev,
                          value: e.target.value,
                        }))
                      }
                      className="input text-sm sm:text-base"
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
                        setFormData((prev) => ({
                          ...prev,
                          location_id: e.target.value,
                        }))
                      }
                      className="input text-sm sm:text-base"
                    >
                      <option value="">Selecione um local</option>
                      {attendanceLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Payment & Convenio */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Forma de Pagamento
                    </label>
                    <select
                      value={formData.payment_method}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          payment_method: e.target.value,
                        }))
                      }
                      className="input text-sm sm:text-base"
                    >
                      <option value="">Selecione uma forma</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="cartao_credito">Cartão de crédito</option>
                      <option value="cartao_debito">Cartão de débito</option>
                      <option value="pix">Pix</option>
                      <option value="boleto">Boleto</option>
                      <option value="outro">Outro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Convênio
                    </label>
                    <input
                      type="text"
                      value={formData.convenio}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          convenio: e.target.value,
                        }))
                      }
                      className="input text-sm sm:text-base"
                      placeholder="Nome do convênio (se houver)"
                    />
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
                      className="input text-sm sm:text-base"
                      rows={3}
                      placeholder="Observações sobre a consulta..."
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="btn btn-secondary text-sm sm:text-base"
                    disabled={isCreating}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className={`btn btn-primary text-sm sm:text-base ${
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

        {showQuickPrivatePatientModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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

        {/* Status Change Modal */}
        {showStatusModal && selectedConsultation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
            <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg sm:text-xl font-bold flex items-center">
                    <Settings className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 mr-2" />
                    Alterar Status
                  </h2>
                  <button
                    onClick={closeStatusModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5 sm:h-6 sm:w-6" />
                  </button>
                </div>
              </div>

              <div className="p-4 sm:p-6">
                {/* Consultation Info */}
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6">
                  <div className="flex items-center mb-2">
                    {selectedConsultation.is_dependent ? (
                      <Users className="h-4 w-4 text-blue-600 mr-2" />
                    ) : (
                      <User className="h-4 w-4 text-green-600 mr-2" />
                    )}
                    <span className="font-medium text-sm sm:text-base">
                      {selectedConsultation.client_name}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">
                    <strong>Serviço:</strong>{" "}
                    {selectedConsultation.service_name}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">
                    <strong>Data/Hora:</strong>{" "}
                    {(() => {
                      const utcDate = new Date(selectedConsultation.date);
                      const brazilDate = new Date(
                        utcDate.getTime() - 3 * 60 * 60 * 1000
                      );
                      return (
                        brazilDate.toLocaleDateString("pt-BR") +
                        " às " +
                        brazilDate.toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                      );
                    })()}
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600">
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
                            <div className="font-medium text-gray-900 text-sm sm:text-base">
                              {status.label}
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-6">
                  <button
                    type="button"
                    onClick={closeStatusModal}
                    className="btn btn-secondary text-sm sm:text-base"
                    disabled={isUpdatingStatus}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={updateConsultationStatus}
                    className={`btn btn-primary text-sm sm:text-base ${
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

        {/* Reschedule Consultation Modal */}
        <RescheduleConsultationModal
          isOpen={showRescheduleModal}
          consultation={consultationToReschedule}
          defaultDate={rescheduleDefaults.date}
          defaultTime={rescheduleDefaults.time}
          slotDuration={slotDuration}
          onClose={closeRescheduleModal}
          onSuccess={handleRescheduleSuccess}
        />

        {/* Cancel Consultation Modal */}
        <CancelConsultationModal
          isOpen={showCancelModal}
          onClose={closeModals}
          onConfirm={handleCancelConsultation}
          consultationData={
            selectedConsultation
              ? {
                  id: selectedConsultation.id,
                  patient_name: selectedConsultation.client_name,
                  service_name: selectedConsultation.service_name,
                  date: selectedConsultation.date,
                  professional_name: user?.name || "",
                  location_name: selectedConsultation.location_name || "",
                  is_dependent: selectedConsultation.is_dependent,
                  patient_type: selectedConsultation.patient_type,
                }
              : null
          }
        />

        {/* Slot Customization Modal */}
        <SlotCustomizationModal
          isOpen={showSlotModal}
          currentSlotDuration={slotDuration}
          startTime={workingStart}
          endTime={workingEnd}
          onClose={() => setShowSlotModal(false)}
          onSlotDurationChange={handleSlotDurationChange}
          onWorkingHoursChange={handleWorkingHoursChange}
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
