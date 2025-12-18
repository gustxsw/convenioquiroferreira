import React, { useState, useEffect } from "react";
import {
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Tag,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";

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
  subscriptionExpiry,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [verifiedStatus, setVerifiedStatus] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState(true);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState("");
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // 🔥 VERIFICAÇÃO DUPLA: Sempre verificar status no servidor antes de mostrar pagamento
  useEffect(() => {
    const verifySubscriptionStatus = async () => {
      try {
        setIsVerifying(true);
        const apiUrl = getApiUrl();

        console.log(
          "🔍 VERIFICAÇÃO DUPLA: Verificando status de assinatura para userId:",
          userId
        );
        console.log("🔍 Status recebido via props:", subscriptionStatus);

        const response = await fetchWithAuth(
          `${apiUrl}/api/users/${userId}/subscription-status`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log(
            "✅ Status verificado no servidor:",
            data.subscription_status
          );
          setVerifiedStatus(data.subscription_status);
        } else {
          console.warn("⚠️ Falha na verificação, usando status das props");
          setVerifiedStatus(subscriptionStatus);
        }
      } catch (error) {
        console.error(
          "❌ Erro na verificação, usando status das props:",
          error
        );
        setVerifiedStatus(subscriptionStatus);
      } finally {
        setIsVerifying(false);
      }
    };

    if (userId) {
      verifySubscriptionStatus();
    }
  }, [userId, subscriptionStatus]);

  useEffect(() => {
    // Load MercadoPago SDK v2 only if payment is needed
    if (verifiedStatus !== "active" && !isVerifying) {
      const script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.type = "text/javascript";
      script.onload = () => {
        const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;
        console.log("MercadoPago Public Key:", publicKey ? "Found" : "Missing");

        if (publicKey && window.MercadoPago) {
          try {
            new window.MercadoPago(publicKey);
            console.log("MercadoPago SDK v2 initialized successfully");
          } catch (error) {
            console.error("Error initializing MercadoPago:", error);
          }
        } else {
          console.warn("MercadoPago public key not found or SDK not loaded");
        }
      };
      script.onerror = () => {
        console.error("Failed to load MercadoPago SDK");
      };
      document.body.appendChild(script);

      return () => {
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
      };
    }
  }, [verifiedStatus, isVerifying]);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError("Digite um código de cupom");
      return;
    }

    try {
      setIsValidatingCoupon(true);
      setCouponError("");

      const apiUrl = getApiUrl();

      const response = await fetchWithAuth(`${apiUrl}/api/validate-coupon/${couponCode.trim()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.valid && data.coupon) {
        setAppliedCoupon(data.coupon);
        setCouponError("");
      } else {
        setCouponError(data.message || "Cupom inválido");
        setAppliedCoupon(null);
      }
    } catch (error) {
      console.error("Error validating coupon:", error);
      setCouponError("Cupom inválido");
      setAppliedCoupon(null);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handlePayment = async () => {
    if (verifiedStatus === "active") {
      console.error("🚫 BLOQUEADO: Tentativa de pagamento para cliente ativo!");
      setError(
        "Sua assinatura já está ativa. Não é necessário realizar pagamento."
      );
      return;
    }

    try {
      setIsLoading(true);
      setError("");

      const apiUrl = getApiUrl();

      console.log("🔄 Creating subscription payment for user:", userId);
      console.log("🔄 Verified status before payment:", verifiedStatus);

      const response = await fetchWithAuth(`${apiUrl}/api/create-subscription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          coupon_code: appliedCoupon ? appliedCoupon.code : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao criar pagamento");
      }

      const data = await response.json();
      console.log("Payment preference created:", data);

      window.location.href = data.init_point;
    } catch (error) {
      console.error("Payment error:", error);
      setError("Ocorreu um erro ao processar o pagamento");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  };

  // 🔥 VERIFICAÇÃO PRIMÁRIA: Se está verificando, mostrar loading
  if (isVerifying) {
    return (
      <div className="card mb-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mr-3"></div>
          <p className="text-gray-600">Verificando status da assinatura...</p>
        </div>
      </div>
    );
  }

  // 🔥 VERIFICAÇÃO SECUNDÁRIA: Se status é ativo, mostrar apenas informações
  if (verifiedStatus === "active") {
    console.log("✅ CLIENTE ATIVO: Mostrando apenas status da assinatura");
    return null;
  }

  // 🔥 VERIFICAÇÃO TERCIÁRIA: Só mostrar pagamento se realmente não for ativo
  console.log(
    "⚠️ CLIENTE INATIVO: Mostrando opções de pagamento para status:",
    verifiedStatus
  );

  const baseAmount = 600;
  const discount = appliedCoupon ? appliedCoupon.discount_value : 0;
  const totalAmount = baseAmount - discount;

  return (
    <div className="card mb-6">
      <div className="flex items-center mb-4">
        <CreditCard className="h-6 w-6 text-red-600 mr-2" />
        <h2 className="text-xl font-semibold">Ativar Assinatura</h2>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="font-medium mb-3">Cupom de Desconto</h3>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Digite o código do cupom"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                disabled={appliedCoupon !== null || isValidatingCoupon}
              />
            </div>
            <button
              onClick={handleApplyCoupon}
              disabled={appliedCoupon !== null || isValidatingCoupon || !couponCode.trim()}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                appliedCoupon !== null
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              {isValidatingCoupon ? "Validando..." : appliedCoupon ? "Aplicado" : "Aplicar"}
            </button>
          </div>

          {couponError && (
            <div className="mt-2 text-sm text-red-600 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" />
              {couponError}
            </div>
          )}

          {appliedCoupon && (
            <div className="mt-2 bg-green-50 text-green-700 p-2 rounded-lg flex items-center text-sm border border-green-200">
              <CheckCircle className="h-4 w-4 mr-2" />
              Cupom aplicado com sucesso!
            </div>
          )}
        </div>

        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="font-medium mb-2">Detalhes da Assinatura (Titular)</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <p>Assinatura do titular:</p>
              <p className={appliedCoupon ? "line-through text-gray-500" : ""}>
                R$ {baseAmount.toFixed(2)}
              </p>
            </div>

            {appliedCoupon && (
              <>
                <div className="flex justify-between text-green-600">
                  <p>Desconto (Cupom {appliedCoupon.code}):</p>
                  <p>- R$ {discount.toFixed(2)}</p>
                </div>
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex justify-between">
                    <p className="font-medium text-lg">Total com desconto:</p>
                    <p className="font-medium text-lg text-green-600">
                      R$ {totalAmount.toFixed(2)}
                    </p>
                  </div>
                </div>
              </>
            )}

            {!appliedCoupon && (
              <div className="border-t border-gray-200 pt-2 mt-2">
                <p className="font-medium">Total: R$ {totalAmount.toFixed(2)}</p>
              </div>
            )}

            <div className="bg-blue-50 p-3 rounded-lg mt-3 border border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>Nota:</strong> Dependentes têm cobrança separada de R$
                100,00 cada. Eles podem ser ativados individualmente após o
                cadastro.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center border border-red-200">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handlePayment}
          className={`btn btn-primary w-full flex items-center justify-center ${
            isLoading ? "opacity-70 cursor-not-allowed" : ""
          }`}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Processando...
            </>
          ) : (
            <>
              <ExternalLink className="h-5 w-5 mr-2" />
              Realizar Pagamento
            </>
          )}
        </button>

        <div className="text-center">
          <p className="text-sm text-gray-600">
            O pagamento será processado de forma segura pelo Mercado Pago
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Você será redirecionado para completar o pagamento
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaymentSection;
