import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, AlertCircle } from "lucide-react";
import DependentsSection from "./DependentsSection";
import PaymentSection from "./PaymentSection";

type Consultation = {
  id: number;
  date: string;
  value: number;
  service_name: string;
  professional_name: string;
  client_name: string;
};

const ClientHomePage: React.FC = () => {
  const { user } = useAuth();
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("");
  const [subscriptionExpiry, setSubscriptionExpiry] = useState<string | null>(
    null
  );

  // Get API URL with fallback
  const getApiUrl = () => {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL;
    }

    if (
      window.location.hostname === "cartaoquiroferreira.com.br" ||
      window.location.hostname === "www.cartaoquiroferreira.com.br"
    ) {
      return "https://convenioquiroferreira.onrender.com";
    }

    return "http://localhost:3001";
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        const token = localStorage.getItem("token");
        const apiUrl = getApiUrl();

        console.log("Fetching client data from:", apiUrl);

        const response = await fetch(`${apiUrl}/api/consultations`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Falha ao carregar consultas");
        }

        const data = await response.json();
        setConsultations(data);

        // Fetch subscription status
        const userResponse = await fetch(`${apiUrl}/api/users/${user?.id}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          setSubscriptionStatus(userData.subscription_status || "pending");
          setSubscriptionExpiry(userData.subscription_expiry);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        setError("Não foi possível carregar seu histórico de consultas");
      } finally {
        setIsLoading(false);
      }
    };

    if (user?.id) {
      fetchData();
    }
  }, [user?.id]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Olá, {user?.name}</h1>
        <p className="text-gray-600">Bem-vindo ao seu painel de cliente.</p>
      </div>

      {subscriptionStatus === "expired" && (
        <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-6">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
            <p className="text-red-700">
              Sua assinatura está vencida. Por favor, renove para continuar
              utilizando os serviços.
            </p>
          </div>
        </div>
      )}

      {subscriptionStatus === "pending" && (
        <div className="bg-yellow-50 border-l-4 border-yellow-600 p-4 mb-6">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
            <p className="text-yellow-700">
              Complete seu cadastro realizando o pagamento da assinatura.
            </p>
          </div>
        </div>
      )}

      {user && (
        <PaymentSection
          userId={user.id}
          subscriptionStatus={subscriptionStatus}
          subscriptionExpiry={subscriptionExpiry}
        />
      )}

      {user && <DependentsSection clientId={user.id} />}

      <div className="card mb-6">
        <div className="flex items-center mb-4">
          <CalendarClock className="h-6 w-6 text-red-600 mr-2" />
          <h2 className="text-xl font-semibold">Seu Histórico de Consultas</h2>
        </div>

        {isLoading ? (
          <div className="text-center py-8">
            <p className="text-gray-600">Carregando consultas...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-md">{error}</div>
        ) : consultations.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <p className="text-gray-600">
              Você ainda não possui consultas registradas.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Paciente</th>
                  <th>Serviço</th>
                  <th>Profissional</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {consultations.map((consultation) => (
                  <tr key={consultation.id}>
                    <td>{formatDate(consultation.date)}</td>
                    <td>{consultation.client_name}</td>
                    <td>{consultation.service_name}</td>
                    <td>{consultation.professional_name}</td>
                    <td>{formatCurrency(consultation.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Informações do Convênio</h2>
        <div className="space-y-2">
          <p>
            <span className="font-medium">Telefone para contato:</span> (64)
            98121-0313
          </p>
          <p>
            <span className="font-medium">Horário de atendimento:</span> Segunda
            a Sexta, das 8h às 18h
          </p>
        </div>
      </div>
    </div>
  );
};

export default ClientHomePage;
