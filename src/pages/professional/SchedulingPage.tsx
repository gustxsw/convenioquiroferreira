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
  CheckCircle,
  XCircle,
  Search,
  DollarSign,
  Edit,
  MessageCircle,
  Gift,
} from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  user_id?: number;
  dependent_id?: number;
  private_patient_id?: number;
  service_id?: number;
  location_id?: number;
  patient_phone?: string;
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
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [hasSchedulingAccess, setHasSchedulingAccess] = useState<boolean>(false);
  const [accessInfo, setAccessInfo] = useState<any>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
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

  // Edit consultation modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({
    patient_type: "private" as "convenio" | "private",
    client_cpf: "",
    private_patient_id: "",
    user_id: "",
    dependent_id: "",
    date: "",
    time: "",
    service_id: "",
    value: "",
    location_id: "",
    notes: "",
  });

  // Edit modal client search state
  const [editClientSearchResult, setEditClientSearchResult] = useState<any>(null);
  const [editDependents, setEditDependents] = useState<any[]>([]);
  const [editSelectedDependentId, setEditSelectedDependentId] = useState<number | null>(null);
  const [isEditSearching, setIsEditSearching] = useState(false);

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

  // Check scheduling access on component mount
  useEffect(() => {
    checkSchedulingAccess();
  }, []);

  useEffect(() => {
    if (hasSchedulingAccess) {
      fetchData();
    }
  }, [selectedDate, hasSchedulingAccess]);

  const checkSchedulingAccess = async () => {
    try {
      setIsCheckingAccess(true);
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      console.log("🔍 Checking scheduling access for professional");

      const response = await fetch(`${apiUrl}/api/professional/scheduling-access`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Scheduling access data:", data);
        setHasSchedulingAccess(data.has_access);
        setAccessInfo(data);
      } else {
        console.warn("⚠️ Scheduling access check failed:", response.status);
        setHasSchedulingAccess(false);
        setAccessInfo(null);
      }
    } catch (error) {
      console.error("❌ Error checking scheduling access:", error);
      setHasSchedulingAccess(false);
      setAccessInfo(null);
    } finally {
      setIsCheckingAccess(false);
    }
  };

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
          setDependents(dependentsData.filter((d: any) => d.subscription_status === "active"));
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

      // Prepare consultation data
      const consultationData: any = {
        service_id: parseInt(formData.service_id),
        location_id: formData.location_id ? parseInt(formData.location_id) : null,
        value: parseFloat(formData.value),
        date: new Date(`${formData.date}T${formData.time}`).toISOString(),
        status: "scheduled",
        notes: formData.notes || null,
      };

      // Set patient based on type
      if (formData.patient_type === "private") {
        consultationData.private_patient_id = parseInt(formData.private_patient_id);
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
      await fetchData();
      setShowNewModal(false);
      resetForm();
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

  const openEditModal = (consultation: Consultation) => {
    setSelectedConsultation(consultation);
    
    // Extract date and time from consultation.date
    const consultationDate = new Date(consultation.date);
    const dateStr = format(consultationDate, "yyyy-MM-dd");
    const timeStr = format(consultationDate, "HH:mm");
    
    // Determine patient type and set form data
    const patientType = consultation.patient_type;
    
    setEditFormData({
      patient_type: patientType,
      client_cpf: "",
      private_patient_id: consultation.private_patient_id?.toString() || "",
      user_id: consultation.user_id?.toString() || "",
      dependent_id: consultation.dependent_id?.toString() || "",
      date: dateStr,
      time: timeStr,
      service_id: consultation.service_id?.toString() || "",
      value: consultation.value.toString(),
      location_id: consultation.location_id?.toString() || "",
      notes: consultation.notes || "",
    });
    
    // Reset search states
    setEditClientSearchResult(null);
    setEditDependents([]);
    setEditSelectedDependentId(null);
    
    // If it's a convenio patient, we need to populate the search result
    if (patientType === "convenio") {
      if (consultation.user_id) {
        // Set client search result for titular
        setEditClientSearchResult({
          id: consultation.user_id,
          name: consultation.client_name,
          subscription_status: "active"
        });
      } else if (consultation.dependent_id) {
        // Set dependent as selected
        setEditSelectedDependentId(consultation.dependent_id);
        setEditClientSearchResult({
          id: consultation.user_id, // This would need to be fetched
          name: "Cliente", // This would need to be fetched
          subscription_status: "active"
        });
      }
    }
    
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setSelectedConsultation(null);
    setError("");
    setEditClientSearchResult(null);
    setEditDependents([]);
    setEditSelectedDependentId(null);
  };

  const searchEditClientByCpf = async () => {
    if (!editFormData.client_cpf) return;

    try {
      setIsEditSearching(true);
      setError("");

      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();
      const cleanCpf = editFormData.client_cpf.replace(/\D/g, "");

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

        setEditClientSearchResult(clientData);
        setEditFormData(prev => ({
          ...prev,
          user_id: clientData.id.toString(),
          dependent_id: ""
        }));
        setEditSelectedDependentId(null);

        // Fetch dependents
        const dependentsResponse = await fetch(
          `${apiUrl}/api/dependents/${clientData.id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (dependentsResponse.ok) {
          const dependentsData = await dependentsResponse.json();
          setEditDependents(dependentsData.filter((d: any) => d.subscription_status === "active"));
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

          setEditClientSearchResult({
            id: dependentData.user_id,
            name: dependentData.client_name,
            subscription_status: "active",
          });
          setEditSelectedDependentId(dependentData.id);
          setEditFormData(prev => ({
            ...prev,
            user_id: "",
            dependent_id: dependentData.id.toString()
          }));
          setEditDependents([]);
        } else {
          setError("Cliente ou dependente não encontrado");
        }
      }
    } catch (error) {
      setError("Erro ao buscar cliente");
    } finally {
      setIsEditSearching(false);
    }
  };

  const handleEditServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const serviceId = e.target.value;
    setEditFormData((prev) => ({ ...prev, service_id: serviceId }));

    // Auto-fill value based on service
    const service = services.find((s) => s.id.toString() === serviceId);
    if (service) {
      setEditFormData((prev) => ({
        ...prev,
        value: service.base_price.toString(),
      }));
    }
  };

  const submitEditConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedConsultation) return;

    try {
      setIsEditing(true);
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      // Prepare consultation data
      const consultationData: any = {
        service_id: parseInt(editFormData.service_id),
        location_id: editFormData.location_id ? parseInt(editFormData.location_id) : null,
        value: parseFloat(editFormData.value),
        date: `${editFormData.date}T${editFormData.time}`,
        notes: editFormData.notes || null,
      };

      // Set patient based on type
      if (editFormData.patient_type === "private") {
        consultationData.private_patient_id = parseInt(editFormData.private_patient_id);
        consultationData.user_id = null;
        consultationData.dependent_id = null;
      } else {
        consultationData.private_patient_id = null;
        if (editSelectedDependentId || editFormData.dependent_id) {
          consultationData.dependent_id = editSelectedDependentId || parseInt(editFormData.dependent_id);
          consultationData.user_id = null;
        } else {
          consultationData.user_id = editClientSearchResult?.id || parseInt(editFormData.user_id);
          consultationData.dependent_id = null;
        }
      }

      const response = await fetch(`${apiUrl}/api/consultations/${selectedConsultation.id}/edit`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(consultationData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao editar consulta");
      }

      setSuccess("Consulta editada com sucesso!");
      await fetchData();
      setShowEditModal(false);
      setTimeout(() => setSuccess(""), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao editar consulta");
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

  const openWhatsAppConfirmation = (consultation: Consultation) => {
    if (!consultation.patient_phone) {
      setError("Telefone do paciente não disponível");
      setTimeout(() => setError(""), 3000);
      return;
    }

    // Format phone number for WhatsApp (remove non-digits and add +55)
    const cleanPhone = consultation.patient_phone.replace(/\D/g, "");
    const whatsappPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    // Format date and time for message
    const appointmentDate = format(new Date(consultation.date), "dd/MM/yyyy");
    const appointmentTime = format(new Date(consultation.date), "HH:mm");

    // Create confirmation message
    const message = `Olá ${consultation.client_name}, você confirma sua consulta no dia ${appointmentDate} às ${appointmentTime}?`;
    const encodedMessage = encodeURIComponent(message);

    // Open WhatsApp in new tab
    const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodedMessage}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
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

  // Show loading while checking access
  if (isCheckingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando acesso à agenda...</p>
        </div>
      </div>
    );
  }

  // Show access denied screen if no access
  if (!hasSchedulingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Calendar className="h-8 w-8 text-red-600" />
            </div>
            
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Acesso à Agenda Restrito
            </h1>
            
            <p className="text-gray-600 mb-6 leading-relaxed">
              Você não possui acesso ao sistema de agendamentos no momento. 
              Entre em contato com o administrador para solicitar acesso.
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <Gift className="h-5 w-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                <div className="text-left">
                  <h3 className="font-medium text-blue-900 mb-2">
                    O que está incluído no acesso:
                  </h3>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Sistema completo de agendamentos</li>
                    <li>• Gestão de pacientes particulares</li>
                    <li>• Prontuários médicos digitais</li>
                    <li>• Geração de documentos médicos</li>
                    <li>• Relatórios detalhados</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-4">
                <strong>Contato do administrador:</strong>
              </p>
              <p className="text-sm text-gray-600">
                📞 (64) 98124-9199<br />
                📧 contato@quiroferreira.com.br
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
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600">Visualize e gerencie suas consultas</p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className={`btn btn-primary flex items-center ${
            !hasSchedulingAccess ? "opacity-50 cursor-not-allowed" : ""
          }`}
          disabled={!hasSchedulingAccess}
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

      {/* Access Info */}
      {hasSchedulingAccess && accessInfo?.expires_at && (
        <div className="bg-green-50 border-l-4 border-green-600 p-4 mb-6">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
            <div>
              <p className="text-green-700 font-medium">
                Acesso à agenda ativo
              </p>
              <p className="text-green-600 text-sm">
                Válido até: {new Date(accessInfo.expires_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>
          </div>
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

          <div className="bg-green-50 p-4 rounded-lg text-center border border-green-200">
            <div className="text-lg font-bold text-green-600">{formatCurrency(dailyStats.totalValue)}</div>
            <div className="text-sm text-green-700">Faturamento</div>
          </div>

          <div className="bg-red-50 p-4 rounded-lg text-center border border-red-200">
            <div className="text-lg font-bold text-red-600">{formatCurrency(dailyStats.convenioValue)}</div>
            <div className="text-sm text-red-700">A Pagar</div>
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
                    className="h-16 flex items-center justify-center border-b border-gray-100 text-sm font-medium text-gray-700"
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

                  return (
                    <div
                      key={timeSlot}
                      className="h-16 border-b border-gray-100 flex items-center px-4 hover:bg-gray-50 transition-colors"
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
                            {consultation.patient_phone && (
                              <button
                                onClick={() => handleWhatsAppConfirmation(consultation)}
                                className="p-1 text-green-600 hover:text-green-800 rounded transition-colors"
                                title="Confirmar via WhatsApp"
                              >
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.106"/>
                                </svg>
                              </button>
                            )}
                            {/* WhatsApp Confirmation Button */}
                            {consultation.patient_phone && (
                              <button
                                onClick={() => openWhatsAppConfirmation(consultation)}
                                className="p-1 text-green-600 hover:text-green-800 rounded transition-colors"
                                title="Confirmar via WhatsApp"
                              >
                                <MessageCircle className="h-3 w-3" />
                              </button>
                            )}
                            
                            {/* Edit Button */}
                            <button
                              onClick={() => openEditModal(consultation)}
                              className="p-1 text-blue-600 hover:text-blue-800 rounded transition-colors"
                              title="Editar consulta"
                            >
                              <Edit className="h-3 w-3" />
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
                        <div className="text-xs text-gray-400 italic">Horário livre</div>
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
              disabled={!hasSchedulingAccess}
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
                    <select
                      value={formData.time}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, time: e.target.value }))
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
                        setFormData((prev) => ({ ...prev, value: e.target.value }))
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
                      setFormData((prev) => ({ ...prev, location_id: e.target.value }))
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
                  {isCreating ? "Criando..." : "Criar Consulta"}
                </button>
              </div>
            </form>
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
                  <Edit className="h-6 w-6 text-blue-600 mr-2" />
                  Editar Consulta
                </h2>
                <button
                  onClick={closeEditModal}
                  className="text-gray-400 hover:text-gray-600"
                  disabled={isEditing}
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <form onSubmit={submitEditConsultation} className="p-6">
              <div className="space-y-6">
                {/* Patient Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Paciente *
                  </label>
                  <select
                    value={editFormData.patient_type}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        patient_type: e.target.value as "convenio" | "private",
                        client_cpf: "",
                        private_patient_id: "",
                        user_id: "",
                        dependent_id: "",
                      }))
                    }
                    className="input"
                    required
                    disabled={isEditing}
                  >
                    <option value="private">Paciente Particular</option>
                    <option value="convenio">Cliente do Convênio</option>
                  </select>
                </div>

                {/* Private Patient Selection */}
                {editFormData.patient_type === "private" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Paciente Particular *
                    </label>
                    <select
                      value={editFormData.private_patient_id}
                      onChange={(e) =>
                        setEditFormData((prev) => ({
                          ...prev,
                          private_patient_id: e.target.value,
                        }))
                      }
                      className="input"
                      required
                      disabled={isEditing}
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
                {editFormData.patient_type === "convenio" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CPF do Cliente *
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={formatCpf(editFormData.client_cpf)}
                        onChange={(e) =>
                          setEditFormData((prev) => ({
                            ...prev,
                            client_cpf: e.target.value.replace(/\D/g, ""),
                          }))
                        }
                        className="input flex-1"
                        placeholder="000.000.000-00"
                        disabled={isEditing}
                      />
                      <button
                        type="button"
                        onClick={searchEditClientByCpf}
                        className="btn btn-secondary"
                        disabled={isEditSearching || isEditing}
                      >
                        {isEditSearching ? "Buscando..." : "Buscar"}
                      </button>
                    </div>

                    {/* Client Search Result */}
                    {editClientSearchResult && (
                      <div className="mt-3 p-3 bg-green-50 rounded-lg">
                        <p className="font-medium text-green-800">
                          Cliente: {editClientSearchResult.name}
                        </p>
                        
                        {/* Dependent Selection */}
                        {editDependents.length > 0 && (
                          <div className="mt-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Dependente (opcional)
                            </label>
                            <select
                              value={editSelectedDependentId || editFormData.dependent_id || ""}
                              onChange={(e) => {
                                const depId = e.target.value ? Number(e.target.value) : null;
                                setEditSelectedDependentId(depId);
                                setEditFormData(prev => ({
                                  ...prev,
                                  dependent_id: depId?.toString() || "",
                                  user_id: depId ? "" : editClientSearchResult.id.toString()
                                }));
                              }}
                              className="input"
                              disabled={isEditing}
                            >
                              <option value="">Consulta para o titular</option>
                              {editDependents.map((dependent) => (
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

                {/* Date and Time */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Data *
                    </label>
                    <input
                      type="date"
                      value={editFormData.date}
                      onChange={(e) =>
                        setEditFormData((prev) => ({ ...prev, date: e.target.value }))
                      }
                      className="input"
                      required
                      disabled={isEditing}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Horário *
                    </label>
                    <select
                      value={editFormData.time}
                      onChange={(e) =>
                        setEditFormData((prev) => ({ ...prev, time: e.target.value }))
                      }
                      className="input"
                      required
                      disabled={isEditing}
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
                      value={editFormData.service_id}
                      onChange={handleEditServiceChange}
                      className="input"
                      required
                      disabled={isEditing}
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
                      value={editFormData.value}
                      onChange={(e) =>
                        setEditFormData((prev) => ({ ...prev, value: e.target.value }))
                      }
                      className="input"
                      required
                      disabled={isEditing}
                    />
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Local de Atendimento
                  </label>
                  <select
                    value={editFormData.location_id || ""}
                    onChange={(e) =>
                      setEditFormData((prev) => ({ ...prev, location_id: e.target.value }))
                    }
                    className="input"
                    disabled={isEditing}
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
                    value={editFormData.notes}
                    onChange={(e) =>
                      setEditFormData((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    className="input min-h-[80px]"
                    placeholder="Observações sobre a consulta..."
                    disabled={isEditing}
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
                  {isEditing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Salvar Alterações
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
                  <span className="font-medium">{selectedConsultation.client_name}</span>
                </div>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Serviço:</strong> {selectedConsultation.service_name}
                </p>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Data/Hora:</strong>{" "}
                  {format(new Date(selectedConsultation.date), "dd/MM/yyyy 'às' HH:mm")}
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
    </div>
  );
};

export default SchedulingPage;