import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import DependentsSection from './DependentsSection';
import PaymentSection from './PaymentSection';

const ClientHomePage: React.FC = () => {
  const { user } = useAuth();
  const [subscriptionStatus, setSubscriptionStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, []);

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await fetch('/api/subscription-status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setSubscriptionStatus(data);
    } catch (error) {
      console.error('Erro ao buscar status da assinatura:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Bem-vindo, {user?.name}!
        </h1>
        <p className="text-gray-600">
          Gerencie sua conta e seus dependentes
        </p>
      </div>

      {/* Status da Assinatura */}
      {subscriptionStatus && (
        <div className={`mb-8 p-4 rounded-lg ${
          subscriptionStatus.active 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-3 ${
              subscriptionStatus.active ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <p className={`font-medium ${
              subscriptionStatus.active ? 'text-green-800' : 'text-red-800'
            }`}>
              {subscriptionStatus.message}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Seção de Dependentes */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <DependentsSection />
        </div>

        {/* Seção de Pagamento */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <PaymentSection onPaymentSuccess={fetchSubscriptionStatus} />
        </div>
      </div>
    </div>
  );
};

export default ClientHomePage;