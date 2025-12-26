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

const AffiliateDashboard: React.FC = () => {
  const [data, setData] = useState<AffiliateData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadDashboard();
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

  const copyAffiliateLink = () => {
    if (!data) return;

    const baseUrl =
      window.location.hostname === "cartaoquiroferreira.com.br" ||
      window.location.hostname === "www.cartaoquiroferreira.com.br"
        ? "https://www.cartaoquiroferreira.com.br"
        : "http://localhost:5173";

    const link = `${baseUrl}/cadastro?ref=${data.affiliate.code}`;

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
            {window.location.hostname === "cartaoquiroferreira.com.br" ||
            window.location.hostname === "www.cartaoquiroferreira.com.br"
              ? "https://www.cartaoquiroferreira.com.br"
              : "http://localhost:5173"}
            /cadastro?ref={data.affiliate.code}
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

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">Como funciona?</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Você recebe R$ 10,00 de comissão por cada cliente que se cadastrar através do seu link</li>
          <li>• A comissão é registrada automaticamente quando o cliente efetua o pagamento</li>
          <li>• O pagamento da comissão é feito manualmente pelo administrador</li>
        </ul>
      </div>
    </div>
  );
};

export default AffiliateDashboard;
