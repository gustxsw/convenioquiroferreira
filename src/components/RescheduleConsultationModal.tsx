import type React from "react";
import { useState, useEffect } from "react";
import { CalendarClock, X, Check, AlertCircle, ArrowRight } from "lucide-react";
import TimeInput from "./TimeInput";
import { validateTimeSlot, type SlotDuration } from "../utils/timeSlotValidation";
import { toUTCString } from "../utils/dateHelpers";
import { fetchWithAuth, getApiUrl } from "../utils/apiHelpers";

type Consultation = {
  id: number;
  date: string;
  client_name: string;
  service_name: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
  value: number;
  is_dependent: boolean;
  patient_type: "convenio" | "private";
  location_name?: string;
};

type RescheduleConsultationModalProps = {
  isOpen: boolean;
  consultation: Consultation | null;
  /**
   * Data/hora ATUAIS já convertidas para exibição (como aparecem na agenda),
   * para evitar reconversão de fuso. defaultDate: "yyyy-MM-dd", defaultTime: "HH:mm".
   */
  defaultDate: string;
  defaultTime: string;
  /** Duração do slot configurada pelo profissional (para validar o horário). */
  slotDuration?: SlotDuration;
  onClose: () => void;
  onSuccess: () => void;
};

/** "yyyy-MM-dd" -> "dd/MM/yyyy" (sem envolver fuso horário). */
const toBRDate = (isoDate: string): string => {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return d && m && y ? `${d}/${m}/${y}` : isoDate;
};

const RescheduleConsultationModal: React.FC<
  RescheduleConsultationModalProps
> = ({
  isOpen,
  consultation,
  defaultDate,
  defaultTime,
  slotDuration = 30,
  onClose,
  onSuccess,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  useEffect(() => {
    if (isOpen && consultation) {
      setError("");
      setDate(defaultDate);
      setTime(defaultTime);
    }
  }, [isOpen, consultation, defaultDate, defaultTime]);

  if (!isOpen || !consultation) return null;

  const isUnchanged = date === defaultDate && time === defaultTime;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!date || !time) {
      setError("Informe a nova data e o novo horário.");
      return;
    }

    const timeValidation = validateTimeSlot(time, slotDuration);
    if (!timeValidation.isValid) {
      setError(timeValidation.error || "Horário inválido");
      return;
    }

    if (isUnchanged) {
      setError("Escolha uma data ou horário diferente do atual.");
      return;
    }

    try {
      setIsSaving(true);
      const apiUrl = getApiUrl();
      // Mesma conversão usada ao AGENDAR (QuickScheduleModal): a data/hora
      // exibidas são convertidas para o formato de armazenamento do backend.
      const dateTimeUTC = toUTCString(date, time);

      const response = await fetchWithAuth(
        `${apiUrl}/api/consultations/${consultation.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          // Remarcação: reagenda para nova data/horário e reativa o status
          // (uma consulta remarcada volta a ficar "agendada").
          body: JSON.stringify({ date: dateTimeUTC, status: "scheduled" }),
        }
      );

      if (!response.ok) {
        let message = "Não foi possível remarcar a consulta.";
        try {
          const errorData = await response.json();
          if (errorData?.message) message = errorData.message;
        } catch {
          /* corpo sem JSON */
        }
        throw new Error(message);
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao remarcar a consulta"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 flex items-center">
            <CalendarClock className="h-5 w-5 text-red-600 mr-2" />
            Remarcar Consulta
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isSaving}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Paciente + horário atual -> novo */}
        <div className="p-4 sm:p-5 bg-gray-50 border-b border-gray-200">
          <p className="font-medium text-gray-900">{consultation.client_name}</p>
          <p className="text-sm text-gray-600">{consultation.service_name}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-700">
              {toBRDate(defaultDate)} · {defaultTime}
            </span>
            <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 border border-red-100 text-red-700 font-medium">
              {toBRDate(date)}
              {time ? ` · ${time}` : ""}
            </span>
          </div>
        </div>

        {error && (
          <div className="mx-4 sm:mx-5 mt-4 bg-red-50 text-red-600 p-3 rounded-lg flex items-start text-sm">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nova data <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
                required
                disabled={isSaving}
              />
            </div>

            <TimeInput
              value={time}
              onChange={setTime}
              label="Novo horário"
              required
              disabled={isSaving}
            />
          </div>

          <p className="text-xs text-gray-500 mt-3">
            O novo horário precisa estar dentro do seu expediente e não pode
            estar bloqueado.
          </p>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary w-full sm:w-auto"
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={`btn btn-primary w-full sm:w-auto ${
                isSaving ? "opacity-70 cursor-not-allowed" : ""
              }`}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Remarcando...
                </>
              ) : (
                <>
                  <Check className="h-5 w-5 mr-2" />
                  Confirmar remarcação
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RescheduleConsultationModal;
