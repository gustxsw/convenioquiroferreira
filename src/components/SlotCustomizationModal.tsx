import React, { useState } from 'react';
import { Clock, X, Check, Settings } from 'lucide-react';
import { getSlotDurationDescription } from '../utils/timeSlotValidation';

type SlotDuration = 15 | 30 | 60;

type SlotCustomizationModalProps = {
  isOpen: boolean;
  currentSlotDuration: SlotDuration;
  startTime: string;
  endTime: string;
  onClose: () => void;
  onSlotDurationChange: (duration: SlotDuration) => void;
  onWorkingHoursChange: (startTime: string, endTime: string) => void;
};

const SlotCustomizationModal: React.FC<SlotCustomizationModalProps> = ({
  isOpen,
  currentSlotDuration,
  startTime,
  endTime,
  onClose,
  onSlotDurationChange,
  onWorkingHoursChange,
}) => {
  const [selectedDuration, setSelectedDuration] = useState<SlotDuration>(currentSlotDuration);
  const [selectedStart, setSelectedStart] = useState<string>(startTime);
  const [selectedEnd, setSelectedEnd] = useState<string>(endTime);
  const [hoursError, setHoursError] = useState<string>("");

  // Sincroniza os campos quando o modal reabre com novos valores
  React.useEffect(() => {
    if (isOpen) {
      setSelectedDuration(currentSlotDuration);
      setSelectedStart(startTime);
      setSelectedEnd(endTime);
      setHoursError("");
    }
  }, [isOpen, currentSlotDuration, startTime, endTime]);

  const slotOptions = [
    {
      value: 15 as SlotDuration,
      label: '15 minutos',
      description: 'Consultas rápidas e avaliações - Horários: 09:00, 09:15, 09:30, 09:45...',
      icon: '⚡',
    },
    {
      value: 30 as SlotDuration,
      label: '30 minutos',
      description: 'Consultas padrão e procedimentos - Horários: 09:00, 09:30, 10:00, 10:30...',
      icon: '⏰',
    },
    {
      value: 60 as SlotDuration,
      label: '60 minutos',
      description: 'Consultas longas e terapias - Horários: 09:00, 10:00, 11:00, 12:00...',
      icon: '🕐',
    },
  ];

  const handleApply = () => {
    if (selectedStart >= selectedEnd) {
      setHoursError("O horário de início deve ser anterior ao horário de fim.");
      return;
    }

    onSlotDurationChange(selectedDuration);
    onWorkingHoursChange(selectedStart, selectedEnd);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center">
              <Settings className="h-6 w-6 text-red-600 mr-2" />
              Configurações da Agenda
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-4">
            <p className="text-gray-600 text-sm">
              Escolha a duração dos slots de tempo. Esta configuração determina quais horários 
              você pode digitar ao agendar consultas (ex: com slots de 30 min, você pode usar 
              09:00, 09:30, 10:00, mas não 09:15).
            </p>
          </div>

          <div className="space-y-3">
            {slotOptions.map((option) => (
              <label
                key={option.value}
                className={`
                  flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all
                  ${selectedDuration === option.value
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }
                `}
              >
                <input
                  type="radio"
                  name="slotDuration"
                  value={option.value}
                  checked={selectedDuration === option.value}
                  onChange={(e) => setSelectedDuration(Number(e.target.value) as SlotDuration)}
                  className="sr-only"
                />
                
                <div className="flex items-center flex-1">
                  <div className="text-2xl mr-3">{option.icon}</div>
                  <div className="flex-1">
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 text-gray-500 mr-2" />
                      <span className="font-medium text-gray-900">{option.label}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                  </div>
                  
                  {selectedDuration === option.value && (
                    <div className="ml-3">
                      <div className="w-5 h-5 bg-red-600 rounded-full flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className="mt-6 border-t border-gray-200 pt-6">
            <h3 className="text-base font-semibold text-gray-900 flex items-center mb-1">
              <Clock className="h-5 w-5 text-red-600 mr-2" />
              Horário de Trabalho
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              Defina o horário de início e fim do seu expediente. A agenda mostrará
              apenas os horários dentro desse período.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Início
                </label>
                <input
                  type="time"
                  value={selectedStart}
                  onChange={(e) => {
                    setSelectedStart(e.target.value);
                    setHoursError("");
                  }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fim
                </label>
                <input
                  type="time"
                  value={selectedEnd}
                  onChange={(e) => {
                    setSelectedEnd(e.target.value);
                    setHoursError("");
                  }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
                />
              </div>
            </div>

            {hoursError && (
              <p className="text-sm text-red-600 mt-2">{hoursError}</p>
            )}
          </div>

          <div className="bg-blue-50 p-4 rounded-lg mt-6">
            <h4 className="font-medium text-blue-900 mb-2">💡 Dica:</h4>
            <p className="text-sm text-blue-700">
              Você pode alterar a duração dos slots a qualquer momento. Esta configuração 
              determina quais horários são válidos ao digitar manualmente o horário das consultas. 
              Consultas já agendadas não são afetadas.
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancelar
          </button>
          <button
            onClick={handleApply}
            className="btn btn-primary flex items-center"
          >
            <Check className="h-5 w-5 mr-2" />
            Aplicar Configuração
          </button>
        </div>
      </div>
    </div>
  );
};

export default SlotCustomizationModal;