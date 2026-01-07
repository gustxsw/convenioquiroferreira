import React, { useState, useEffect } from "react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import { DollarSign, TrendingUp, Users, Download, Clock, CheckCircle } from "lucide-react";

interface Affiliate {
  id: number;
  name: string;
  code: string;
  status: string;
  commission_amount: string;
  created_at: string;
  total_commissions_count: number;
  pending_total: string;
  paid_total: string;
  total_amount: string;
}

interface Commission {
  id: number;
  amount: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  affiliate_name: string;
  affiliate_code: string;
  client_name: string;
  client_cpf: string;
}

interface Stats {
  total_affiliates: number;
  active_affiliates: number;
  total_commissions: number;
  total_pending: string;
  total_paid: string;
  total_commissions_amount: string;
}

interface ReportData {
  affiliates: Affiliate[];
  commissions: Commission[];
  stats: Stats;
}

const AffiliateFinancialReport: React.FC = () => {
  const [data, setData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "paid">("all");

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setIsLoading(true);
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}/api/admin/affiliates/financial-report`);

      if (response.ok) {
        const reportData = await response.json();
        setData(reportData);
      } else {
        setError("Erro ao carregar relatório");
      }
    } catch (err) {
      setError("Erro ao carregar relatório");
    } finally {
      setIsLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!data) return;

    const csvRows = [
      ["Data", "Afiliado", "Cliente", "CPF", "Valor", "Status", "Pago em"],
      ...data.commissions.map(c => [
        new Date(c.created_at).toLocaleDateString("pt-BR"),
        c.affiliate_name,
        c.client_name,
        c.client_cpf,
        `R$ ${Number.parseFloat(c.amount).toFixed(2)}`,
        c.status === "paid" ? "Pago" : "Pendente",
        c.paid_at ? new Date(c.paid_at).toLocaleDateString("pt-BR") : "-"
      ])
    ];

    const csvContent = csvRows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio-comissoes-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const filteredCommissions = data.commissions.filter(c => {
    if (filterStatus === "all") return true;
    return c.status === filterStatus;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Relatório Financeiro de Afiliados</h1>
        <button
          onClick={exportToCSV}
          className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          <Download className="w-5 h-5 mr-2" />
          Exportar CSV
        </button>
      </div>

      {/* Cards de Estatísticas Gerais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Afiliados Ativos</p>
              <p className="text-2xl font-bold text-gray-900">
                {data.stats.active_affiliates}/{data.stats.total_affiliates}
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
              <p className="text-sm text-gray-600">Total Comissões</p>
              <p className="text-2xl font-bold text-gray-900">{data.stats.total_commissions}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-yellow-100 p-3 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">A Pagar</p>
              <p className="text-2xl font-bold text-yellow-600">
                R$ {Number.parseFloat(data.stats.total_pending).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-green-100 p-3 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Já Pago</p>
              <p className="text-2xl font-bold text-green-600">
                R$ {Number.parseFloat(data.stats.total_paid).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Resumo Total */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-sm border border-green-200 p-6">
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="w-6 h-6 text-green-600" />
          <h2 className="text-xl font-semibold text-gray-900">Valor Total em Comissões</h2>
        </div>
        <p className="text-4xl font-bold text-green-600">
          R$ {Number.parseFloat(data.stats.total_commissions_amount).toFixed(2)}
        </p>
        <p className="text-sm text-gray-600 mt-2">
          Soma de todas as comissões (pagas + pendentes)
        </p>
      </div>

      {/* Resumo por Afiliado */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Resumo por Afiliado</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Afiliado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Comissões
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pendente
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pago
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.affiliates.map((affiliate) => (
                <tr key={affiliate.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{affiliate.name}</div>
                      <div className="text-xs text-gray-500">{affiliate.code}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        affiliate.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {affiliate.status === "active" ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {affiliate.total_commissions_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-yellow-600">
                    R$ {Number.parseFloat(affiliate.pending_total).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                    R$ {Number.parseFloat(affiliate.paid_total).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                    R$ {Number.parseFloat(affiliate.total_amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Histórico Detalhado de Comissões */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Histórico de Comissões ({filteredCommissions.length})
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterStatus("all")}
                className={`px-3 py-1 text-sm rounded-lg ${
                  filterStatus === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setFilterStatus("pending")}
                className={`px-3 py-1 text-sm rounded-lg ${
                  filterStatus === "pending"
                    ? "bg-yellow-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Pendentes
              </button>
              <button
                onClick={() => setFilterStatus("paid")}
                className={`px-3 py-1 text-sm rounded-lg ${
                  filterStatus === "paid"
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Pagas
              </button>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Afiliado
                </th>
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
                  Pago em
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCommissions.map((commission) => (
                <tr key={commission.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(commission.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {commission.affiliate_name}
                  </td>
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
                      className={`px-2 py-1 text-xs rounded-full ${
                        commission.status === "paid"
                          ? "bg-green-100 text-green-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {commission.status === "paid" ? "Pago" : "Pendente"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {commission.paid_at
                      ? new Date(commission.paid_at).toLocaleDateString("pt-BR")
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AffiliateFinancialReport;
