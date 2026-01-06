import React, { useState, useEffect } from "react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import {
  Users, DollarSign, CheckCircle, Clock, Copy, TrendingUp, Eye,
  ArrowUp, ArrowDown, Target, Award, BarChart3, Zap, Star,
  MousePointerClick, UserPlus, CreditCard
} from "lucide-react";

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

  const earningsPerConversion = totalConversions > 0 ? (parseFloat(data.stats.paid_total) / totalConversions).toFixed(2) : "0.00";
  const avgTicket = "10.00";

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6 bg-gray-50">
      {/* Hero Header with Gradient */}
      <div className="relative overflow-hidden bg-gradient-to-br from-orange-600 via-red-600 to-pink-600 rounded-2xl shadow-2xl p-6 sm:p-8 text-white">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-60 h-60 bg-white/10 rounded-full blur-3xl"></div>

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold mb-2 flex items-center gap-3">
                <Award className="w-10 h-10" />
                Dashboard de Vendas
              </h1>
              <p className="text-lg sm:text-xl text-white/90">
                Bem-vindo, <span className="font-semibold">{data.affiliate.name}</span>!
              </p>
            </div>
            <div className="hidden sm:block">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 text-center">
                <Star className="w-8 h-8 mx-auto mb-1 text-yellow-300" />
                <p className="text-xs text-white/80">Vendedor</p>
                <p className="text-lg font-bold">Top 10%</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4">
              <MousePointerClick className="w-6 h-6 mb-2 text-blue-200" />
              <p className="text-2xl sm:text-3xl font-bold">{totalClicks}</p>
              <p className="text-xs sm:text-sm text-white/80">Visitantes</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4">
              <UserPlus className="w-6 h-6 mb-2 text-green-200" />
              <p className="text-2xl sm:text-3xl font-bold">{totalRegistrations}</p>
              <p className="text-xs sm:text-sm text-white/80">Cadastros</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4">
              <CreditCard className="w-6 h-6 mb-2 text-yellow-200" />
              <p className="text-2xl sm:text-3xl font-bold">{totalConversions}</p>
              <p className="text-xs sm:text-sm text-white/80">Pagamentos</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4">
              <TrendingUp className="w-6 h-6 mb-2 text-purple-200" />
              <p className="text-2xl sm:text-3xl font-bold">{conversionRate}%</p>
              <p className="text-xs sm:text-sm text-white/80">Conversão</p>
            </div>
          </div>
        </div>
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

      {/* Performance Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Clientes */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex items-center text-green-600 text-sm font-semibold">
              <ArrowUp className="w-4 h-4 mr-1" />
              12%
            </div>
          </div>
          <p className="text-gray-600 text-sm font-medium mb-1">Clientes Ativos</p>
          <p className="text-3xl font-bold text-gray-900 mb-1">{data.stats.clients_count}</p>
          <p className="text-xs text-gray-500">Indicados confirmados</p>
        </div>

        {/* Total Recebido */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-green-100 p-3 rounded-lg">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex items-center text-green-600 text-sm font-semibold">
              <ArrowUp className="w-4 h-4 mr-1" />
              8%
            </div>
          </div>
          <p className="text-gray-600 text-sm font-medium mb-1">Total Recebido</p>
          <p className="text-3xl font-bold text-gray-900 mb-1">
            R$ {Number.parseFloat(data.stats.paid_total).toFixed(2)}
          </p>
          <p className="text-xs text-gray-500">Comissões pagas</p>
        </div>

        {/* Pendente */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-yellow-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-yellow-100 p-3 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="flex items-center text-yellow-600 text-sm font-semibold">
              <Zap className="w-4 h-4 mr-1" />
              Ativo
            </div>
          </div>
          <p className="text-gray-600 text-sm font-medium mb-1">Aguardando</p>
          <p className="text-3xl font-bold text-gray-900 mb-1">
            R$ {Number.parseFloat(data.stats.pending_total).toFixed(2)}
          </p>
          <p className="text-xs text-gray-500">Pagamentos pendentes</p>
        </div>

        {/* Ticket Médio */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="bg-purple-100 p-3 rounded-lg">
              <Target className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex items-center text-purple-600 text-sm font-semibold">
              <Star className="w-4 h-4 mr-1" />
              Meta
            </div>
          </div>
          <p className="text-gray-600 text-sm font-medium mb-1">Ticket Médio</p>
          <p className="text-3xl font-bold text-gray-900 mb-1">R$ {avgTicket}</p>
          <p className="text-xs text-gray-500">Por conversão</p>
        </div>
      </div>

      {/* Conversion Funnel - Redesigned */}
      {referralStats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Funil Visual */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
              <BarChart3 className="w-6 h-6 mr-2 text-red-600" />
              Funil de Conversão
            </h2>

            <div className="space-y-6">
              {/* Stage 1 - Visitantes */}
              <div className="relative">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-blue-100 p-2 rounded-lg">
                      <Eye className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Visitantes</p>
                      <p className="text-xs text-gray-500">Cliques no link</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">{totalClicks}</p>
                    <p className="text-xs text-gray-500">100%</p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-4 rounded-full" style={{ width: "100%" }}></div>
                </div>
              </div>

              {/* Arrow Down */}
              <div className="flex justify-center">
                <ArrowDown className="w-6 h-6 text-gray-400" />
              </div>

              {/* Stage 2 - Cadastros */}
              <div className="relative">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-orange-100 p-2 rounded-lg">
                      <UserPlus className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Cadastros</p>
                      <p className="text-xs text-gray-500">Criaram conta</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">{totalRegistrations}</p>
                    <p className="text-xs text-orange-600 font-semibold">{registrationRate}%</p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div className="bg-gradient-to-r from-orange-500 to-orange-600 h-4 rounded-full transition-all"
                    style={{ width: totalClicks > 0 ? `${(totalRegistrations / totalClicks) * 100}%` : "0%" }}>
                  </div>
                </div>
              </div>

              {/* Arrow Down */}
              <div className="flex justify-center">
                <ArrowDown className="w-6 h-6 text-gray-400" />
              </div>

              {/* Stage 3 - Conversões */}
              <div className="relative">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-green-100 p-2 rounded-lg">
                      <CreditCard className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Pagamentos</p>
                      <p className="text-xs text-gray-500">Completaram compra</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-gray-900">{totalConversions}</p>
                    <p className="text-xs text-green-600 font-semibold">{conversionRate}%</p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div className="bg-gradient-to-r from-green-500 to-green-600 h-4 rounded-full transition-all"
                    style={{ width: totalClicks > 0 ? `${(totalConversions / totalClicks) * 100}%` : "0%" }}>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Insights */}
          <div className="space-y-4">
            {/* Taxa de Conversão Principal */}
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Target className="w-8 h-8" />
                  <div>
                    <p className="text-sm opacity-90">Taxa de Conversão</p>
                    <p className="text-xs opacity-75">Visitantes → Pagamentos</p>
                  </div>
                </div>
                <div className="bg-white/20 p-2 rounded-lg">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
              <p className="text-5xl font-bold mb-2">{conversionRate}%</p>
              <p className="text-sm opacity-90">
                {conversionRate === "0.0" ? "Comece a compartilhar seu link!" : `Excelente! Continue assim!`}
              </p>
            </div>

            {/* Insights Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow-lg p-4 border-t-4 border-blue-500">
                <p className="text-xs text-gray-600 mb-1">Taxa de Cadastro</p>
                <p className="text-2xl font-bold text-gray-900">{registrationRate}%</p>
                <p className="text-xs text-gray-500 mt-1">Visitantes → Cadastros</p>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-4 border-t-4 border-green-500">
                <p className="text-xs text-gray-600 mb-1">Comissão Média</p>
                <p className="text-2xl font-bold text-gray-900">R$ {avgTicket}</p>
                <p className="text-xs text-gray-500 mt-1">Por conversão</p>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-4 border-t-4 border-purple-500">
                <p className="text-xs text-gray-600 mb-1">Potencial</p>
                <p className="text-2xl font-bold text-gray-900">
                  R$ {(parseFloat(data.stats.pending_total) + parseFloat(data.stats.paid_total)).toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Total gerado</p>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-4 border-t-4 border-orange-500">
                <p className="text-xs text-gray-600 mb-1">Próximo Nível</p>
                <p className="text-2xl font-bold text-gray-900">{Math.max(0, 10 - data.stats.clients_count)}</p>
                <p className="text-xs text-gray-500 mt-1">Clientes faltando</p>
              </div>
            </div>

            {/* Dica do Dia */}
            <div className="bg-gradient-to-r from-yellow-100 to-orange-100 border-l-4 border-orange-500 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Zap className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-orange-900 text-sm">Dica de Performance</p>
                  <p className="text-xs text-orange-800 mt-1">
                    {totalClicks === 0
                      ? "Compartilhe seu link nas redes sociais para começar!"
                      : conversionRate === "0.0"
                      ? "Seus visitantes ainda não converteram. Continue divulgando!"
                      : parseFloat(conversionRate) < 5
                      ? "Boa taxa de conversão! Aumente seus visitantes para ganhar mais."
                      : "Excelente performance! Você está entre os melhores vendedores!"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clientes Indicados - Redesigned */}
      {data.clients.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 sm:p-6 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                  <Users className="w-6 h-6" />
                  Clientes Indicados
                </h2>
                <p className="text-sm text-white/90 mt-1">
                  {data.clients.length} cliente{data.clients.length !== 1 ? "s" : ""} indicado{data.clients.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2">
                <p className="text-2xl font-bold">{data.clients.length}</p>
              </div>
            </div>
          </div>

          {/* Mobile - Cards */}
          <div className="block sm:hidden">
            {data.clients.map((client, index) => (
              <div key={index} className="p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      client.subscription_status === "active" ? "bg-green-100" : "bg-yellow-100"
                    }`}>
                      <Users className={`w-5 h-5 ${
                        client.subscription_status === "active" ? "text-green-600" : "text-yellow-600"
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{client.name}</h3>
                      <p className="text-xs text-gray-500">
                        {new Date(client.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 text-xs font-semibold rounded-full ${
                      client.subscription_status === "active"
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {client.subscription_status === "active" ? "Pago" : "Pendente"}
                  </span>
                </div>
                {client.subscription_status === "active" && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                    <DollarSign className="w-3 h-3" />
                    <span className="font-semibold">R$ 10,00 recebido</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop - Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Data de Cadastro
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Comissão
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.clients.map((client, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          client.subscription_status === "active" ? "bg-green-100" : "bg-yellow-100"
                        }`}>
                          <Users className={`w-5 h-5 ${
                            client.subscription_status === "active" ? "text-green-600" : "text-yellow-600"
                          }`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{client.name}</p>
                          <p className="text-xs text-gray-500">Cliente #{index + 1}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(client.created_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full ${
                          client.subscription_status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {client.subscription_status === "active" ? (
                          <>
                            <CheckCircle className="w-3 h-3" />
                            Pago
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            Pendente
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {client.subscription_status === "active" ? (
                        <div className="flex items-center gap-1 text-green-600 font-semibold">
                          <DollarSign className="w-4 h-4" />
                          <span className="text-sm">R$ 10,00</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">R$ 0,00</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Como funciona - Redesigned */}
      <div className="bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 rounded-xl overflow-hidden shadow-lg">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Award className="w-6 h-6" />
            Como Funciona o Sistema de Vendas
          </h3>
          <p className="text-sm text-blue-100 mt-1">Entenda como maximizar seus ganhos</p>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-blue-500">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-lg font-bold">
                  1
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Compartilhe seu Link</h4>
                  <p className="text-sm text-gray-600">
                    Copie e compartilhe seu link exclusivo nas redes sociais, WhatsApp ou email
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-green-500">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center text-lg font-bold">
                  2
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Rastreamento Automático</h4>
                  <p className="text-sm text-gray-600">
                    Cada clique é rastreado e vinculado a você automaticamente
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-orange-500">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center text-lg font-bold">
                  3
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Vínculo Permanente</h4>
                  <p className="text-sm text-gray-600">
                    Visitantes que se cadastram ficam vinculados a você para sempre
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-purple-500">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-500 text-white flex items-center justify-center text-lg font-bold">
                  4
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">Ganhe R$ 10 por Cliente</h4>
                  <p className="text-sm text-gray-600">
                    Quando seu indicado faz o pagamento, você recebe R$ 10,00
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="bg-green-500 p-2 rounded-lg">
                <Target className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-green-900 mb-2">Meta de Vendas</h4>
                <p className="text-sm text-green-800 mb-3">
                  Alcance 10 clientes pagos e ganhe um bônus extra de R$ 50,00!
                </p>
                <div className="w-full bg-green-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (data.stats.clients_count / 10) * 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-green-700 mt-2 font-semibold">
                  {data.stats.clients_count} de 10 clientes ({Math.round((data.stats.clients_count / 10) * 100)}%)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AffiliateDashboard;
