import React, { useState, useEffect } from "react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import { Copy, CreditCard, Users, Clock, DollarSign } from "lucide-react";
import PieChart from "../../components/PieChart";

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
    total_commissions: string;
  };
  clients: Array<{
    name: string;
    created_at: string;
    subscription_status: string;
    commission_amount: string | null;
    commission_status: string | null;
    commission_paid_at: string | null;
    commission_created_at: string | null;
    cpf?: string | null;
  }>;
  commissions: Array<{
    id: number;
    amount: string;
    status: string;
    created_at: string;
    paid_at: string | null;
    paid_method?: string | null;
    paid_receipt_url?: string | null;
    paid_by_name?: string | null;
    payment_reference?: string | null;
    mp_payment_id?: string | null;
    client_name: string;
    client_cpf: string;
    client_subscription_status: string;
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
  const [clientSearch, setClientSearch] = useState("");

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

    const link = `${window.location.origin}/register?ref=${data.affiliate.code}`;

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

  const totalRegistrations = parseInt(referralStats?.total_registrations || "0");
  const totalConversions = parseInt(referralStats?.total_conversions || "0");
  const activeClients = data.clients.filter(
    (client) => client.subscription_status === "active"
  ).length;
  const pendingClients = data.clients.filter(
    (client) => client.subscription_status !== "active"
  ).length;

  const pieChartData = [
    { label: "Cadastros", value: totalRegistrations, color: "#F59E0B" },
    { label: "Pagamentos", value: totalConversions, color: "#10B981" },
  ];

  const filteredClients = data.clients.filter((client) => {
    const term = clientSearch.trim().toLowerCase();
    if (!term) return true;
    const name = client.name?.toLowerCase() || "";
    const cpf = client.cpf?.toLowerCase() || "";
    return name.includes(term) || cpf.includes(term);
  });

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
        </div>
      </div>

      {/* Link de Indicação */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Seu Link de Indicação</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <code className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 break-all font-mono">
            {window.location.origin}/register?ref={data.affiliate.code}
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
          Compartilhe este link e ganhe por cada cliente que realizar o pagamento
        </p>
      </div>

      {/* Resumo Rápido */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Clientes Ativos</p>
              <p className="text-2xl font-bold text-gray-900">{activeClients}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-yellow-100 p-3 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Clientes Pendentes</p>
              <p className="text-2xl font-bold text-gray-900">{pendingClients}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-green-100 p-3 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">A Receber</p>
              <p className="text-2xl font-bold text-gray-900">
                R$ {Number.parseFloat(data.stats.pending_total || "0").toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-emerald-100 p-3 rounded-lg">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Já Recebido</p>
              <p className="text-2xl font-bold text-gray-900">
                R$ {Number.parseFloat(data.stats.paid_total || "0").toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico de Conversão */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Cadastros vs Pagamentos
        </h2>
        <div className="flex justify-center">
          <PieChart data={pieChartData} size={240} />
        </div>
      </div>

      {/* Lista de Clientes */}
      {data.clients.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Clientes Indicados ({filteredClients.length})
            </h2>
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Pesquisar por nome ou CPF"
              className="w-full sm:w-64 px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CPF
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
                {filteredClients.map((client, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {client.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {client.cpf || "-"}
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
                        {client.subscription_status === "active" ? "Ativo" : "Pendente"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {client.commission_amount ? (
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-green-600">
                            R$ {Number.parseFloat(client.commission_amount).toFixed(2)}
                          </span>
                          <span
                            className={`text-xs ${
                              client.commission_status === "paid"
                                ? "text-green-600"
                                : "text-yellow-600"
                            }`}
                          >
                            {client.commission_status === "paid" ? "✓ Pago" : "⏳ Pendente"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Sem comissão</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Histórico de Recebimentos */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-gray-600" />
            Histórico de Recebimentos ({data.commissions.length})
          </h2>
        </div>
        {data.commissions.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            Nenhum recebimento registrado ainda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CPF
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Origem
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pago em
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comprovante
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.commissions.map((commission) => (
                  <tr key={commission.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {commission.client_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {commission.client_cpf}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                      R$ {Number.parseFloat(commission.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          commission.status === "paid"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {commission.status === "paid" ? "Pago" : "Pendente"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {commission.payment_reference || commission.mp_payment_id || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {commission.paid_at
                        ? new Date(commission.paid_at).toLocaleDateString("pt-BR")
                        : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {commission.paid_receipt_url ? (
                        <a
                          href={commission.paid_receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:text-blue-700"
                        >
                          Ver
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Instruções */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">Como Funciona</h3>
        <div className="space-y-2 text-sm text-blue-800">
          <p>1. Compartilhe seu link único de indicação com potenciais clientes</p>
          <p>2. Quando alguém clicar no seu link, o sistema rastreia automaticamente</p>
          <p>3. Se a pessoa se cadastrar, ela fica vinculada a você permanentemente</p>
          <p>4. Quando o cliente fizer o primeiro pagamento, você recebe comissão</p>
          <p>5. O pagamento é feito manualmente pelo administrador do sistema</p>
        </div>
      </div>
    </div>
  );
};

export default AffiliateDashboard;
