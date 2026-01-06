import React, { useState, useEffect } from "react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import { Users, DollarSign, CheckCircle, Clock, Copy, TrendingUp, Eye } from "lucide-react";

interface AffiliateData {
  affiliate: {
    id: number;
    name: string;
    code: string;
    status: string;
    created_at: string;
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

interface Referral {
  id: number;
  visitor_identifier: string;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  user_cpf: string | null;
  subscription_status: string | null;
  converted: boolean;
  converted_at: string | null;
  created_at: string;
}

const AffiliateDashboard: React.FC = () => {
  const [data, setData] = useState<AffiliateData | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
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
        setReferrals(data.referrals || []);
        setReferralStats(data.stats || null);
      }
    } catch (err) {
      console.error("Erro ao carregar referências:", err);
    }
  };

  const copyAffiliateLink = () => {
    if (!data) return;

    const link = `${window.location.origin}/register?ref=${data.affiliate.id}`;

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

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="text-center sm:text-left">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Painel do Vendedor</h1>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          Bem-vindo, {data.affiliate.name}!
        </p>
      </div>

      {/* Link de Indicação - Mobile Optimized */}
      <div className="p-4 sm:p-6 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg text-white">
        <h2 className="text-base sm:text-lg font-semibold mb-3 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2" />
          Seu Link de Indicação
        </h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <code className="flex-1 p-3 bg-white/10 backdrop-blur-sm rounded-lg text-xs sm:text-sm break-all">
            {window.location.origin}/register?ref={data.affiliate.id}
          </code>
          <button
            onClick={copyAffiliateLink}
            className="px-4 py-3 bg-white text-red-600 rounded-lg hover:bg-gray-100 font-semibold flex items-center justify-center transition-all"
          >
            <Copy className="w-4 h-4 mr-2" />
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
        <p className="text-xs sm:text-sm text-white/90 mt-3">
          Compartilhe este link e ganhe R$ 10,00 por cada cliente que pagar
        </p>
      </div>

      {/* Stats Cards - Mobile Optimized */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-4 sm:p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium opacity-90">Clientes</p>
            <Users className="w-8 h-8 sm:w-10 sm:h-10 opacity-80" />
          </div>
          <p className="text-3xl sm:text-4xl font-bold">{data.stats.clients_count}</p>
          <p className="text-xs mt-1 opacity-75">Indicados ativos</p>
        </div>

        <div className="bg-gradient-to-br from-yellow-500 to-orange-500 p-4 sm:p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium opacity-90">Pendente</p>
            <Clock className="w-8 h-8 sm:w-10 sm:h-10 opacity-80" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold">
            R$ {Number.parseFloat(data.stats.pending_total).toFixed(2)}
          </p>
          <p className="text-xs mt-1 opacity-75">Aguardando pagamento</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 p-4 sm:p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium opacity-90">Recebido</p>
            <DollarSign className="w-8 h-8 sm:w-10 sm:h-10 opacity-80" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold">
            R$ {Number.parseFloat(data.stats.paid_total).toFixed(2)}
          </p>
          <p className="text-xs mt-1 opacity-75">Total pago</p>
        </div>
      </div>

      {/* Conversion Funnel - Mobile Optimized */}
      {referralStats && (
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-red-600" />
            Funil de Conversão
          </h2>

          <div className="space-y-4">
            {/* Clicks */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center">
                  <Eye className="w-4 h-4 mr-2 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">Visitantes</span>
                </div>
                <span className="text-sm font-bold text-gray-900">{totalClicks}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all"
                  style={{ width: "100%" }}
                ></div>
              </div>
            </div>

            {/* Registrations */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center">
                  <Users className="w-4 h-4 mr-2 text-yellow-600" />
                  <span className="text-sm font-medium text-gray-700">Cadastros</span>
                </div>
                <span className="text-sm font-bold text-gray-900">
                  {totalRegistrations} ({registrationRate}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 h-3 rounded-full transition-all"
                  style={{ width: totalClicks > 0 ? `${(totalRegistrations / totalClicks) * 100}%` : "0%" }}
                ></div>
              </div>
            </div>

            {/* Conversions */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center">
                  <DollarSign className="w-4 h-4 mr-2 text-green-600" />
                  <span className="text-sm font-medium text-gray-700">Pagamentos</span>
                </div>
                <span className="text-sm font-bold text-gray-900">
                  {totalConversions} ({conversionRate}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all"
                  style={{ width: totalClicks > 0 ? `${(totalConversions / totalClicks) * 100}%` : "0%" }}
                ></div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-900 font-medium">
              Taxa de Conversão: {conversionRate}%
            </p>
            <p className="text-xs text-blue-700 mt-1">
              De cada 100 pessoas que clicam no seu link, {conversionRate} fazem o pagamento
            </p>
          </div>
        </div>
      )}

      {/* Clientes Indicados - Mobile Optimized */}
      {data.clients.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Clientes Indicados</h2>
            <p className="text-sm text-gray-600 mt-1">
              {data.clients.length} cliente{data.clients.length !== 1 ? "s" : ""} indicado{data.clients.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Mobile - Cards */}
          <div className="block sm:hidden divide-y divide-gray-200">
            {data.clients.map((client, index) => (
              <div key={index} className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-gray-900">{client.name}</h3>
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      client.subscription_status === "active"
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {client.subscription_status === "active" ? "Ativo" : "Pendente"}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  {new Date(client.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
            ))}
          </div>

          {/* Desktop - Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Nome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Data de Cadastro
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.clients.map((client, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {client.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(client.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          client.subscription_status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {client.subscription_status === "active" ? "Ativo" : "Pendente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Como funciona - Mobile Optimized */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-4 sm:p-6">
        <h3 className="font-bold text-blue-900 text-base sm:text-lg mb-3 flex items-center">
          <CheckCircle className="w-5 h-5 mr-2" />
          Como funciona?
        </h3>
        <ul className="text-sm text-blue-800 space-y-2">
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold mr-2 mt-0.5">1</span>
            <span>Compartilhe seu link único de indicação</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold mr-2 mt-0.5">2</span>
            <span>O sistema rastreia automaticamente cada pessoa que clica no seu link</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold mr-2 mt-0.5">3</span>
            <span>Quando o visitante se cadastra, ele fica vinculado a você permanentemente</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold mr-2 mt-0.5">4</span>
            <span>Se ele pagar hoje, amanhã ou daqui 1 mês, você recebe R$ 10,00 de comissão</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold mr-2 mt-0.5">5</span>
            <span>O pagamento da comissão é feito manualmente pelo administrador</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default AffiliateDashboard;
