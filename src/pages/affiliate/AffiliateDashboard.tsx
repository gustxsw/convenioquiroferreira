import React, { useState, useEffect } from "react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import { Users, DollarSign, CheckCircle, Clock, Copy } from "lucide-react";

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
        <p>Carregando...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          {error || "Erro ao carregar dados"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Painel do Vendedor</h1>
        <p className="text-gray-600">
          Bem-vindo, {data.affiliate.name}!
        </p>
      </div>

      <div className="mb-6 p-6 bg-gradient-to-r from-red-50 to-red-100 rounded-lg border border-red-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Seu Link de Indicação
        </h2>
        <div className="flex items-center gap-2">
          <code className="flex-1 p-3 bg-white rounded border text-sm">
            {window.location.origin}/register?ref={data.affiliate.id}
          </code>
          <button
            onClick={copyAffiliateLink}
            className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center"
          >
            <Copy className="w-4 h-4 mr-2" />
            {copied ? "Copiado!" : "Copiar"}
          </button>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Compartilhe este link com seus contatos para receber comissão por cada cliente que se cadastrar
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Clientes Indicados</p>
              <p className="text-3xl font-bold text-gray-900">
                {data.stats.clients_count}
              </p>
            </div>
            <Users className="w-12 h-12 text-blue-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Comissão Pendente</p>
              <p className="text-3xl font-bold text-yellow-600">
                R$ {Number.parseFloat(data.stats.pending_total).toFixed(2)}
              </p>
            </div>
            <Clock className="w-12 h-12 text-yellow-500" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Recebido</p>
              <p className="text-3xl font-bold text-green-600">
                R$ {Number.parseFloat(data.stats.paid_total).toFixed(2)}
              </p>
            </div>
            <DollarSign className="w-12 h-12 text-green-500" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">Clientes Indicados</h2>
        </div>
        {data.clients.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Nenhum cliente indicado ainda
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                        {client.subscription_status === "active"
                          ? "Ativo"
                          : "Pendente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {referralStats && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
            <p className="text-sm text-gray-600 mb-1">Total de Clicks</p>
            <p className="text-3xl font-bold text-blue-600">{referralStats.total_clicks}</p>
            <p className="text-xs text-gray-500 mt-1">Pessoas que acessaram seu link</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500">
            <p className="text-sm text-gray-600 mb-1">Cadastros</p>
            <p className="text-3xl font-bold text-yellow-600">{referralStats.total_registrations}</p>
            <p className="text-xs text-gray-500 mt-1">Usuários que se registraram</p>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
            <p className="text-sm text-gray-600 mb-1">Conversões</p>
            <p className="text-3xl font-bold text-green-600">{referralStats.total_conversions}</p>
            <p className="text-xs text-gray-500 mt-1">Pagamentos realizados</p>
          </div>
        </div>
      )}

      {referrals.length > 0 && (
        <div className="mt-6 bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold text-gray-900">Histórico de Referências</h2>
            <p className="text-sm text-gray-600 mt-1">
              Acompanhe o status de cada pessoa que clicou no seu link
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Data do Click
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Nome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Conversão
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {referrals.map((referral) => (
                  <tr key={referral.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(referral.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {referral.user_name || (
                        <span className="text-gray-400 italic">Aguardando cadastro</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {referral.user_email || (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {!referral.user_id ? (
                        <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">
                          Apenas Click
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                          Cadastrado
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {referral.converted ? (
                        <span className="flex items-center text-green-600">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Convertido
                        </span>
                      ) : (
                        <span className="flex items-center text-yellow-600">
                          <Clock className="w-4 h-4 mr-1" />
                          Pendente
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">Como funciona?</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Compartilhe seu link único de indicação</li>
          <li>• O sistema rastreia automaticamente cada pessoa que clica no seu link</li>
          <li>• Quando o visitante se cadastra, ele fica vinculado a você permanentemente</li>
          <li>• Se ele pagar o convênio hoje, amanhã ou daqui 1 mês, você recebe a comissão</li>
          <li>• Você recebe R$ 10,00 de comissão por cada cliente que efetuar o pagamento</li>
          <li>• O pagamento da comissão é feito manualmente pelo administrador</li>
        </ul>
      </div>
    </div>
  );
};

export default AffiliateDashboard;
