import React, { useState } from 'react';
import { X, AlertTriangle, Check, MessageSquare } from 'lucide-react';

type CancelConsultationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  consultationData: {
    id: number;
    patient_name: string;
    service_name: string;
    date: string;
    professional_name?: string;
  } | null;
  isLoading?: boolean;
};

const CancelConsultationModal: React.FC<CancelConsultationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  consultationData,
  isLoading = false
}) => {
  const [cancellationReason, setCancellationReason] = useState('');

  const handleConfirm = () => {
    onConfirm(cancellationReason.trim() || undefined);
    setCancellationReason('');
  };

  const handleClose = () => {
    setCancellationReason('');
    onClose();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen || !consultationData) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center">
              <AlertTriangle className="h-6 w-6 text-red-600 mr-2" />
              Cancelar Consulta
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={isLoading}
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Consultation Details */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-gray-900 mb-2">Detalhes da Consulta</h3>
            <div className="space-y-1 text-sm text-gray-600">
              <p><strong>Paciente:</strong> {consultationData.patient_name}</p>
              <p><strong>Serviço:</strong> {consultationData.service_name}</p>
              <p><strong>Data/Hora:</strong> {formatDate(consultationData.date)}</p>
              {consultationData.professional_name && (
                <p><strong>Profissional:</strong> {consultationData.professional_name}</p>
              )}
            </div>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-yellow-800 mb-1">Atenção</h4>
                <p className="text-sm text-yellow-700">
                  Esta ação irá cancelar a consulta permanentemente. O horário será liberado 
                  para novos agendamentos, mas a consulta será mantida no histórico como cancelada.
                </p>
              </div>
            </div>
          </div>

          {/* Cancellation Reason */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <MessageSquare className="h-4 w-4 inline mr-1" />
              Motivo do Cancelamento (opcional)
            </label>
            <textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              rows={3}
              placeholder="Descreva o motivo do cancelamento (ex: paciente faltou, reagendamento solicitado, etc.)"
              disabled={isLoading}
              maxLength={500}
            />
            <p className="text-xs text-gray-500 mt-1">
              {cancellationReason.length}/500 caracteres
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={handleClose}
              className="btn btn-secondary"
              disabled={isLoading}
            >
              Voltar
            </button>
            <button
              onClick={handleConfirm}
              className={`btn bg-red-600 text-white hover:bg-red-700 flex items-center ${
                isLoading ? 'opacity-70 cursor-not-allowed' : ''
              }`}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Cancelando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Confirmar Cancelamento
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CancelConsultationModal;