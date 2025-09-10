import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  Calendar,
  Clock,
  Plus,
  Edit,
  Trash2,
  User,
  Users,
  MapPin,
  Settings,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Repeat,
} from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import EditConsultationModal from "../../components/EditConsultationModal";
import SlotCustomizationModal from "../../components/SlotCustomizationModal";
import CancelConsultationModal from "../../components/CancelConsultationModal";
import CancelledConsultationsModal from "../../components/CancelledConsultationsModal";
import QuickScheduleModal from "../../components/QuickScheduleModal";
import RecurringConsultationModal from "../../components/RecurringConsultationModal";
import { validateTimeSlot, type SlotDuration } from "../../utils/timeSlotValidation";

type Appointment = {
  id: number;
  date: string;
  time: string;
  patient_name: string;
  service_name: string;
  professional_name: string;
  location_name: string | null;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  value: number;
  notes: string | null;
  is_dependent: boolean;
  patient_type: 'convenio' | 'private';
};

type Consultation = {
  id: number;
  date: string;
  client_name: string;
  service_name: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  value: number;
  notes?: string;
  is_dependent: boolean;
  patient_type: 'convenio' | 'private';
  location_name?: string;
};

const SchedulingPage: React.FC = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [slotDuration, setSlotDuration] = useState<SlotDuration>(30);

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCancelledModal, setShowCancelledModal] = useState(false);
  const [showQuickScheduleModal, setShowQuickScheduleModal] = useState(false);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);

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
    fetchAppointments();
  }, [selectedDate]);

  const fetchAppointments = async () => {
    try {
      setIsLoading(true);
      setError('');

      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();

      const dateStr = selectedDate.toISOString().split('T')[0];
      console.log('🔄 Fetching appointments for date:', dateStr);

      const response = await fetch(
        `${apiUrl}/api/appointments?date=${dateStr}&professional_id=${user?.id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      console.log('📡 Appointments response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ Appointments loaded:', data.length);
        setAppointments(data);
      } else {
        console.warn('⚠️ Appointments not available:', response.status);
        setAppointments([]);
      }
    } catch (error) {
      console.error('❌ Error fetching appointments:', error);
      setError('Não foi possível carregar os agendamentos');
      setAppointments([]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateTimeSlots = () => {
    const slots = [];
    const startHour = 7;
    const endHour = 18;

    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += slotDuration) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeString);
      }
    }

    return slots;
  };

  const getAppointmentForSlot = (time: string) => {
    return appointments.find(apt => {
      const aptTime = new Date(apt.date).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      return aptTime === time;
    });
  };

  const handleSlotClick = (time: string) => {
    const appointment = getAppointmentForSlot(time);
    
    if (appointment) {
      // If slot is occupied, open edit modal
      const consultation: Consultation = {
        id: appointment.id,
        date: appointment.date,
        client_name: appointment.patient_name,
        service_name: appointment.service_name,
        status: appointment.status,
        value: appointment.value,
        notes: appointment.notes || undefined,
        is_dependent: appointment.is_dependent,
        patient_type: appointment.patient_type,
        location_name: appointment.location_name || undefined,
      };
      setSelectedConsultation(consultation);
      setShowEditModal(true);
    } else {
      // If slot is empty, open quick schedule modal
      setSelectedSlot({
        date: selectedDate.toISOString().split('T')[0],
        time: time
      });
      setShowQuickScheduleModal(true);
    }
  };

  const handleEditSuccess = () => {
    fetchAppointments();
    setShowEditModal(false);
    setSelectedConsultation(null);
    setSuccess('Consulta atualizada com sucesso!');
  };

  const handleQuickScheduleSuccess = () => {
    fetchAppointments();
    setShowQuickScheduleModal(false);
    setSelectedSlot(null);
    setSuccess('Consulta agendada com sucesso!');
  };

  const handleRecurringSuccess = () => {
    fetchAppointments();
    setShowRecurringModal(false);
    setSuccess('Consultas recorrentes criadas com sucesso!');
  };

  const openCancelModal = (appointment: Appointment) => {
    const consultation: Consultation = {
      id: appointment.id,
      date: appointment.date,
      client_name: appointment.patient_name,
      service_name: appointment.service_name,
      status: appointment.status,
      value: appointment.value,
      notes: appointment.notes || undefined,
      is_dependent: appointment.is_dependent,
      patient_type: appointment.patient_type,
      location_name: appointment.location_name || undefined,
    };
    setSelectedConsultation(consultation);
    setShowCancelModal(true);
  };

  const handleCancelSuccess = async () => {
    await fetchAppointments();
    setShowCancelModal(false);
    setSelectedConsultation(null);
    setSuccess('Consulta cancelada com sucesso!');
  };

  const getSlotStyle = (appointment: Appointment | undefined) => {
    if (!appointment) {
      return 'bg-gray-50 hover:bg-blue-100 border-gray-200 hover:border-blue-300 cursor-pointer transition-all duration-200';
    }

    // Different colors based on patient type
    if (appointment.patient_type === 'private') {
      return 'bg-purple-100 border-purple-300 hover:bg-purple-200 cursor-pointer';
    } else if (appointment.is_dependent) {
      return 'bg-blue-100 border-blue-300 hover:bg-blue-200 cursor-pointer';
    } else {
      return 'bg-green-100 border-green-300 hover:bg-green-200 cursor-pointer';
    }
  };

  const getPatientTypeBadge = (appointment: Appointment) => {
    if (appointment.patient_type === 'private') {
      return (
        <span className="px-2 py-1 bg-purple-200 text-purple-800 rounded-full text-xs font-medium flex items-center">
          <User className="h-3 w-3 mr-1" />
          Particular
        </span>
      );
    } else if (appointment.is_dependent) {
      return (
        <span className="px-2 py-1 bg-blue-200 text-blue-800 rounded-full text-xs font-medium flex items-center">
          <Users className="h-3 w-3 mr-1" />
          Dependente
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 bg-green-200 text-green-800 rounded-full text-xs font-medium flex items-center">
          <User className="h-3 w-3 mr-1" />
          Titular
        </span>
      );
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const timeSlots = generateTimeSlots();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-gray-600">Gerencie seus agendamentos e horários</p>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={() => setShowSlotModal(true)}
            className="btn btn-outline flex items-center"
          >
            <Settings className="h-5 w-5 mr-2" />
            Configurar Slots
          </button>

          <button
            onClick={() => setShowCancelledModal(true)}
            className="btn btn-outline flex items-center"
          >
            <XCircle className="h-5 w-5 mr-2" />
            Ver Canceladas
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-6">
          {success}
        </div>
      )}

      {/* Date Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedDate(subDays(selectedDate, 1))}
            className="btn btn-secondary flex items-center"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900">
              {format(selectedDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </h2>
            <p className="text-sm text-gray-600">
              {appointments.length} agendamento(s) para este dia
            </p>
          </div>

          <button
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            className="btn btn-secondary flex items-center"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Legenda:</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded mr-2"></div>
            <span>Cliente Titular</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded mr-2"></div>
            <span>Dependente</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-purple-100 border border-purple-300 rounded mr-2"></div>
            <span>Paciente Particular</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-gray-50 border border-gray-200 rounded mr-2"></div>
            <span>Horário Livre (clique para agendar)</span>
          </div>
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center mb-6">
          <Clock className="h-6 w-6 text-red-600 mr-2" />
          <h2 className="text-xl font-semibold">Horários do Dia</h2>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando agenda...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {timeSlots.map((time) => {
              const appointment = getAppointmentForSlot(time);
              const slotStyle = getSlotStyle(appointment);

              return (
                <div
                  key={time}
                  onClick={() => handleSlotClick(time)}
                  className={`p-4 rounded-lg border-2 transition-all duration-200 ${slotStyle}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{time}</span>
                    {appointment && (
                      <div className="flex space-x-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openCancelModal(appointment);
                          }}
                          className="p-1 text-red-600 hover:bg-red-100 rounded"
                          title="Cancelar"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {appointment ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {appointment.patient_name}
                        </span>
                        {getPatientTypeBadge(appointment)}
                      </div>
                      
                      <p className="text-sm text-gray-600">{appointment.service_name}</p>
                      
                      {appointment.location_name && (
                        <div className="flex items-center text-xs text-gray-500">
                          <MapPin className="h-3 w-3 mr-1" />
                          {appointment.location_name}
                        </div>
                      )}
                      
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(appointment.value)}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <Plus className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Clique para agendar</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recurring Consultations Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Repeat className="h-6 w-6 text-red-600 mr-2" />
            <h2 className="text-xl font-semibold">Consultas Recorrentes</h2>
          </div>
          
          <button
            onClick={() => setShowRecurringModal(true)}
            className="btn btn-primary flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Criar Recorrência
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">💡 Como funciona:</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• <strong>Diário:</strong> Selecione os dias da semana para repetir</li>
            <li>• <strong>Semanal:</strong> Escolha quantas semanas seguidas</li>
            <li>• <strong>Mensal:</strong> Defina o intervalo entre consultas</li>
            <li>• Todas as consultas são criadas automaticamente na agenda</li>
          </ul>
        </div>
      </div>

      {/* Modals */}
      <EditConsultationModal
        isOpen={showEditModal}
        consultation={selectedConsultation}
        onClose={() => {
          setShowEditModal(false);
          setSelectedConsultation(null);
        }}
        onSuccess={handleEditSuccess}
      />

      <SlotCustomizationModal
        isOpen={showSlotModal}
        currentSlotDuration={slotDuration}
        onClose={() => setShowSlotModal(false)}
        onSlotDurationChange={(duration) => {
          setSlotDuration(duration);
          setShowSlotModal(false);
          setSuccess(`Duração dos slots alterada para ${duration} minutos`);
        }}
      />

      <CancelConsultationModal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setSelectedConsultation(null);
        }}
        onConfirm={async (reason) => {
          if (!selectedConsultation) return;

          try {
            const token = localStorage.getItem('token');
            const apiUrl = getApiUrl();

            const response = await fetch(
              `${apiUrl}/api/appointments/${selectedConsultation.id}/cancel`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  cancellation_reason: reason || null,
                }),
              }
            );

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.message || 'Erro ao cancelar consulta');
            }

            await handleCancelSuccess();
          } catch (error) {
            setError(error instanceof Error ? error.message : 'Erro ao cancelar consulta');
          }
        }}
        consultationData={
          selectedConsultation
            ? {
                id: selectedConsultation.id,
                patient_name: selectedConsultation.client_name,
                service_name: selectedConsultation.service_name,
                date: selectedConsultation.date,
                is_dependent: selectedConsultation.is_dependent,
                patient_type: selectedConsultation.patient_type,
                location_name: selectedConsultation.location_name,
              }
            : null
        }
      />

      <CancelledConsultationsModal
        isOpen={showCancelledModal}
        onClose={() => setShowCancelledModal(false)}
      />

      <QuickScheduleModal
        isOpen={showQuickScheduleModal}
        onClose={() => {
          setShowQuickScheduleModal(false);
          setSelectedSlot(null);
        }}
        onSuccess={handleQuickScheduleSuccess}
        selectedSlot={selectedSlot}
      />

      <RecurringConsultationModal
        isOpen={showRecurringModal}
        onClose={() => setShowRecurringModal(false)}
        onSuccess={handleRecurringSuccess}
      />
    </div>
  );
};

export default SchedulingPage;