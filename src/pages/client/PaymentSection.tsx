import React, { useState, useContext } from 'react';
import { AuthContext } from '../../contexts/AuthContext';

interface PaymentSectionProps {
  onPaymentSuccess: () => void;
}

export const PaymentSection: React.FC<PaymentSectionProps> = ({ onPaymentSuccess }) => {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getApiUrl = () => {
    return import.meta.env.VITE_API_URL || 'http://localhost:3001';
  };

  const handlePayment = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiUrl()}/api/client/create-subscription-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          userId: user.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Erro ao processar pagamento');
      }

      if (data.success) {
        onPaymentSuccess();
      } else {
        throw new Error('Falha no processamento do pagamento');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const basePrice = 250;
  const dependentPrice = 50;
  const dependentsCount = user?.dependents?.length || 0;
  const totalPrice = basePrice + (dependentsCount * dependentPrice);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-xl font-semibold mb-4">Pagamento da Assinatura</h3>
      
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span>Assinatura base:</span>
          <span className="font-semibold">{formatCurrency(basePrice)}</span>
        </div>
        
        {dependentsCount > 0 && (
          <div className="flex justify-between items-center mb-2">
            <span>Dependentes ({dependentsCount}x):</span>
            <span className="font-semibold">{formatCurrency(dependentsCount * dependentPrice)}</span>
          </div>
        )}
        
        <hr className="my-3" />
        
        <div className="flex justify-between items-center text-lg font-bold">
          <span>Total:</span>
          <span className="text-blue-600">{formatCurrency(totalPrice)}</span>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <button
        onClick={handlePayment}
        disabled={loading}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Processando...' : 'Pagar Assinatura'}
      </button>

      <p className="text-sm text-gray-600 mt-4 text-center">
        Pagamento seguro processado via MercadoPago
      </p>
    </div>
  );
};