import React, { useState, useEffect } from 'react';
import { CreditCard, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

declare global {
  interface Window {
    MercadoPago: any;
  }
}

type PaymentSectionProps = {
  userId: number;
  subscriptionStatus: string;
  subscriptionExpiry: string | null;
};

const PaymentSection: React.FC<PaymentSectionProps> = ({ 
  userId, 
  subscriptionStatus,
  subscriptionExpiry 
}) => {
  const [dependentCount, setDependentCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Get API URL - PRODUCTION READY
  const getApiUrl = () => {
    if (window.location.hostname === 'www.cartaoquiroferreira.com.br' || 
        window.location.hostname === 'cartaoquiroferreira.com.br') {
      return 'https://www.cartaoquiroferreira.com.br';
    }
    
    return 'http://localhost:3001';
  };
  
  useEffect(() => {
    // 🔥 CARREGANDO SDK v2 DO MERCADOPAGO - VERSÃO CORRETA
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.type = 'text/javascript';
    script.onload = () => {
      const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;
      console.log('🔥 MercadoPago SDK v2 loaded successfully');
      
      if (publicKey && window.MercadoPago) {
        try {
          // 🔥 SDK v2 INITIALIZATION - FORMATO OFICIAL
          const mp = new window.MercadoPago(publicKey, {
            locale: 'pt-BR'
          });
          console.log('✅ MercadoPago SDK v2 initialized with locale pt-BR');
        } catch (error) {
          console.error('❌ Error initializing MercadoPago SDK v2:', error);
        }
      }
    };
    script.onerror = () => {
      console.error('❌ Failed to load MercadoPago SDK v2');
    };
    document.body.appendChild(script);
    
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);
  
  useEffect(() => {
    const fetchDependents = async () => {
      try {
        const token = localStorage.getItem('token');
        const apiUrl = getApiUrl();
        
        const response = await fetch(`${apiUrl}/api/dependents/${userId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          setDependentCount(data.length);
        }
      } catch (error) {
        console.error('Error fetching dependents:', error);
      }
    };
    
    fetchDependents();
  }, [userId]);
  
  const handlePayment = async () => {
    try {
      setIsLoading(true);
      setError('');
      setSuccess('');
      
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();
      
      console.log('🔥 Creating subscription payment with SDK v2');
      console.log('🔥 Webhook URL: /api/webhooks/payment-success');
      
      const response = await fetch(`${apiUrl}/api/create-subscription`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          dependent_ids: []
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao criar pagamento');
      }
      
      const data = await response.json();
      console.log('✅ Payment preference created successfully:', data);
      
      setSuccess('Redirecionando para o pagamento...');
      
      // Redirect to MercadoPago
      setTimeout(() => {
        window.open(data.init_point, '_blank');
      }, 1000);
    } catch (error) {
      console.error('❌ Payment error:', error);
      setError('Ocorreu um erro ao processar o pagamento. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 🔥 NOVOS PREÇOS: R$ 250 titular + R$ 50 por dependente
  const titularPrice = 250;
  const dependentPrice = 50;
  const totalAmount = titularPrice + (dependentCount * dependentPrice);
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  };
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };
  
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
      <div className="flex items-center mb-4">
        <CreditCard className="h-6 w-6 text-red-600 mr-2" />
        <h2 className="text-xl font-semibold">Assinatura</h2>
      </div>
      
      <div className="space-y-4">
        {subscriptionStatus === 'active' && subscriptionExpiry && (
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="flex items-center mb-2">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              <p className="text-green-700 font-medium">
                Assinatura ativa até {formatDate(subscriptionExpiry)}
              </p>
            </div>
          </div>
        )}
        
        {(subscriptionStatus === 'pending' || subscriptionStatus === 'expired') && (
          <>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="font-medium mb-3 text-blue-900">Detalhes da Assinatura</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-blue-700">Titular:</span>
                  <span className="font-medium text-blue-900">{formatCurrency(titularPrice)}</span>
                </div>
                {dependentCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-blue-700">Dependentes ({dependentCount}):</span>
                    <span className="font-medium text-blue-900">{formatCurrency(dependentCount * dependentPrice)}</span>
                  </div>
                )}
                <div className="border-t border-blue-200 pt-2">
                  <div className="flex justify-between">
                    <span className="font-bold text-blue-900">Total:</span>
                    <span className="font-bold text-lg text-blue-900">{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {error && (
              <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center border border-red-200">
                <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            {success && (
              <div className="bg-green-50 text-green-600 p-4 rounded-lg flex items-center border border-green-200">
                <CheckCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                <span>{success}</span>
              </div>
            )}
            
            <button
              onClick={handlePayment}
              className={`btn btn-primary w-full flex items-center justify-center ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
              disabled={isLoading}
            >
              {isLoading ? (
                'Processando...'
              ) : (
                <>
                  <ExternalLink className="h-5 w-5 mr-2" />
                  Pagar {formatCurrency(totalAmount)}
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentSection;