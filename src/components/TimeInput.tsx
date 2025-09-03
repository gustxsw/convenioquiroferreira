import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle, CheckCircle, Info, Lightbulb } from 'lucide-react';
import { 
  validateTimeSlot, 
  isValidTimeFormat, 
  getSlotDurationDescription,
  isWithinBusinessHours,
  type SlotDuration 
} from '../utils/timeSlotValidation';

type TimeInputProps = {
  value: string;
  onChange: (time: string) => void;
  slotDuration: SlotDuration;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  showValidation?: boolean;
  businessHours?: {
    start: number;
    end: number;
  };
};

const TimeInput: React.FC<TimeInputProps> = ({
  value,
  onChange,
  slotDuration,
  label = 'Horário',
  placeholder = 'HH:mm',
  required = false,
  disabled = false,
  className = '',
  showValidation = true,
  businessHours = { start: 7, end: 18 }
}) => {
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    error?: string;
    suggestedTime?: string;
  }>({ isValid: true });
  const [showSuggestion, setShowSuggestion] = useState(false);

  useEffect(() => {
    if (value && showValidation) {
      // Validate format first
      if (!isValidTimeFormat(value)) {
        setValidationResult({
          isValid: false,
          error: 'Formato inválido. Use HH:mm (ex: 09:30)'
        });
        return;
      }

      // Validate business hours
      if (!isWithinBusinessHours(value, businessHours.start, businessHours.end)) {
        setValidationResult({
          isValid: false,
          error: `Horário deve estar entre ${businessHours.start}:00 e ${businessHours.end}:00`
        });
        return;
      }

      // Validate slot duration
      const slotValidation = validateTimeSlot(value, slotDuration);
      setValidationResult(slotValidation);
      setShowSuggestion(!slotValidation.isValid && !!slotValidation.suggestedTime);
    } else {
      setValidationResult({ isValid: true });
      setShowSuggestion(false);
    }
  }, [value, slotDuration, showValidation, businessHours]);

  const handleTimeChange = (newTime: string) => {
    onChange(newTime);
  };

  const applySuggestion = () => {
    if (validationResult.suggestedTime) {
      onChange(validationResult.suggestedTime);
      setShowSuggestion(false);
    }
  };

  const getValidationIcon = () => {
    if (!value || !showValidation) return null;
    
    if (validationResult.isValid) {
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    } else {
      return <AlertCircle className="h-4 w-4 text-red-600" />;
    }
  };

  const getInputClassName = () => {
    let baseClass = `input pr-10 ${className}`;
    
    if (value && showValidation) {
      if (validationResult.isValid) {
        baseClass += ' border-green-300 focus:border-green-500 focus:ring-green-200';
      } else {
        baseClass += ' border-red-300 focus:border-red-500 focus:ring-red-200';
      }
    }
    
    return baseClass;
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      
      <div className="relative">
        <input
          type="time"
          value={value}
          onChange={(e) => handleTimeChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={getInputClassName()}
          step="60" // 1 minute steps
        />
        
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
          <Clock className="h-4 w-4 text-gray-400" />
          {getValidationIcon()}
        </div>
      </div>

      {/* Slot duration info */}
      <div className="flex items-start space-x-2 text-xs text-gray-500">
        <Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0" />
        <span>{getSlotDurationDescription(slotDuration)}</span>
      </div>

      {/* Validation feedback */}
      {value && showValidation && !validationResult.isValid && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-700">{validationResult.error}</p>
              
              {showSuggestion && validationResult.suggestedTime && (
                <button
                  type="button"
                  onClick={applySuggestion}
                  className="mt-2 text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full hover:bg-red-200 transition-colors font-medium"
                >
                  ✓ Usar {validationResult.suggestedTime}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success feedback */}
      {value && showValidation && validationResult.isValid && (
        <div className="flex items-center space-x-2 text-xs text-green-600">
          <CheckCircle className="h-3 w-3" />
          <span>✓ Horário válido para slots de {slotDuration} minutos</span>
        </div>
      )}
    </div>
  );
};

export default TimeInput;