import React, { useState, useEffect } from "react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import {
  Users, DollarSign, Clock, Copy, TrendingUp,
  MousePointerClick, UserPlus, CreditCard, ExternalLink
} from "lucide-react";
import PieChart from "../../components/PieChart";
import BarChart from "../../components/BarChart";

interface AffiliateData {
  affiliate: {
    id: number;
    name: string;
    code: string;
    status: string;
    created_at: string;
    user_id?: number;
  };
  stats: {
    clients_count: number;
    pending_total: string;
    paid_total: string;
  };
  clients: Array<{
    name: string;
    created_at: string;
    subscription_status: string;
  }>;
}

interface ReferralStats {
  total_clicks: string;
  total_registrations: string;
  total_conversions: string;
}

const AffiliateDashboard: React.FC = () => {
  const [data, setData] = useState<AffiliateData | null>(null);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadDashboard();
    loadReferrals();
  }, []);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}/api/affiliate/dashboard`);

      if (response.ok) {
        const dashboardData = await response.json();
        setData(dashboardData);
      } else {
        setError("Erro ao carregar dados do painel");
      }
    } catch (err) {
      setError("Erro ao carregar dados do painel");
    } finally {
      setIsLoading(false);
    }
  };

  const loadReferrals = async () => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}/api/affiliate-tracking/my-referrals`);

      if (response.ok) {
        const data = await response.json();
        setReferralStats(data.stats || null);
      }
    } catch (err) {
      console.error("Erro ao carregar referências:", err);
    }
  };

  const copyAffiliateLink = () => {
    if (!data) return;

    const link = `${window.location.origin}/register?ref=${data.affiliate.user_id || data.affiliate.id}`;

    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">Carregando...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          {error || "Erro ao carregar dados"}
        </div>
      </div>
    );
  }

  const totalClicks = parseInt(referralStats?.total_clicks || "0");
  const totalRegistrations = parseInt(referralStats?.total_registrations || "0");
  const totalConversions = parseInt(referralStats?.total_conversions || "0");

  const conversionRate = totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(1) : "0.0";
  const registrationRate = totalClicks > 0 ? ((totalRegistrations / totalClicks) * 100).toFixed(1) : "0.0";

  const pieChartData = [
    { label: "Visitantes", value: totalClicks - totalRegistrations, color: "#3B82F6" },
    { label: "Cadastros", value: totalRegistrations - totalConversions, color: "#F59E0B" },
    { label: "Pagamentos", value: totalConversions, color: "#10B981" },
  ];

  const funnelData = [
    {
      label: "Visitantes",
      value: totalClicks,
      color: "#3B82F6",
      percentage: "100.0",
    },
    {
      label: "Cadastros",
      value: totalRegistrations,
      color: "#F59E0B",
      percentage: registrationRate,
    },
    {
      label: "Pagamentos",
      value: totalConversions,
      color: "#10B981",
      percentage: conversionRate,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard de Vendas</h1>
            <p className="text-sm text-gray-600 mt-1">
              Olá, <span className="font-medium">{data.affiliate.name}</span>
            </p>
          </div>
          <div className="text-center sm:text-right">
            <p className="text-sm text-gray-500">Taxa de Conversão</p>
            <p className="text-4xl font-bold text-red-600">{conversionRate}%</p>
          </div>
        </div>
      </div>

      {/* Link de Indicação */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Seu Link de Indicação</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <code className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 break-all font-mono">
            {window.location.origin}/register?ref={data.affiliate.user_id || data.affiliate.id}
          </code>
          <button
            onClick={copyAffiliateLink}
            className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium flex items-center justify-center gap-2 transition-colors shrink-0"
          >
            <Copy className="w-4 h-4" />
            {copied ? "Copiado!" : "Copiar Link"}
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-3">
          Compartilhe este link e ganhe <span className="font-semibold text-red-600">R$ 10,00</span> por cada cliente que realizar o pagamento
        </p>
      </div>

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Clientes Ativos</p>
              <p className="text-2xl font-bold text-gray-900">{data.stats.clients_count}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-green-100 p-3 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Recebido</p>
              <p className="text-2xl font-bold text-gray-900">
                R$ {Number.parseFloat(data.stats.paid_total).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-yellow-100 p-3 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Aguardando</p>
              <p className="text-2xl font-bold text-gray-900">
                R$ {Number.parseFloat(data.stats.pending_total).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-purple-100 p-3 rounded-lg">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Comissão/Cliente</p>
              <p className="text-2xl font-bold text-gray-900">R$ 10,00</p>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      {referralStats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Pizza - Distribuição */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Distribuição do Funil</h2>
            <div className="flex justify-center">
              <PieChart data={pieChartData} size={240} />
            </div>
          </div>

          {/* Gráfico de Barras - Funil */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Funil de Conversão</h2>
            <BarChart data={funnelData} />
          </div>
        </div>
      )}

      {/* Estatísticas Detalhadas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <MousePointerClick className="w-5 h-5 text-blue-600" />
            <p className="text-sm font-medium text-gray-600">Visitantes</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalClicks}</p>
          <p className="text-xs text-gray-500 mt-1">Cliques no link</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <UserPlus className="w-5 h-5 text-orange-600" />
            <p className="text-sm font-medium text-gray-600">Cadastros</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalRegistrations}</p>
          <p className="text-xs text-gray-500 mt-1">{registrationRate}% dos visitantes</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <CreditCard className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium text-gray-600">Pagamentos</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalConversions}</p>
          <p className="text-xs text-gray-500 mt-1">{conversionRate}% dos visitantes</p>
        </div>
      </div>

      {/* Lista de Clientes */}
      {data.clients.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Clientes Indicados ({data.clients.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data de Cadastro
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comissão
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.clients.map((client, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {client.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(client.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          client.subscription_status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {client.subscription_status === "active" ? "Pago" : "Pendente"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                      {client.subscription_status === "active" ? "R$ 10,00" : "R$ 0,00"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Instruções */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">Como Funciona</h3>
        <div className="space-y-2 text-sm text-blue-800">
          <p>1. Compartilhe seu link único de indicação com potenciais clientes</p>
          <p>2. Quando alguém clicar no seu link, o sistema rastreia automaticamente</p>
          <p>3. Se a pessoa se cadastrar, ela fica vinculada a você permanentemente</p>
          <p>4. Quando o cliente fizer o primeiro pagamento, você recebe R$ 10,00 de comissão</p>
          <p>5. O pagamento é feito manualmente pelo administrador do sistema</p>
        </div>
      </div>
    </div>
  );
};

export default AffiliateDashboard;
