import React, { useState, useEffect } from "react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import { DollarSign, TrendingUp, Users, Download, Clock, CheckCircle } from "lucide-react";
import * as XLSX from "xlsx";

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
  payment_reference?: string | null;
  mp_payment_id?: string | null;
  affiliate_id: number;
  affiliate_name: string;
  affiliate_code: string;
  affiliate_pix_key?: string | null;
  client_name: string;
  client_cpf: string;
  client_created_at?: string | null;
  paid_by_name?: string | null;
  paid_method?: string | null;
  paid_receipt_url?: string | null;
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
  const [success, setSuccess] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "paid">("all");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedCommissionIds, setSelectedCommissionIds] = useState<number[]>([]);
  const [batchReceipt, setBatchReceipt] = useState<File | null>(null);
  const [isBatchPaying, setIsBatchPaying] = useState(false);
  const [selectedAffiliateId, setSelectedAffiliateId] = useState<number | null>(null);
  const [affiliateSearchTerm, setAffiliateSearchTerm] = useState("");

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


  const copyPixKey = async (pixKey?: string | null) => {
    if (!pixKey) return;
    try {
      await navigator.clipboard.writeText(pixKey);
      setSuccess("Chave Pix copiada!");
      setTimeout(() => setSuccess(""), 2000);
    } catch (err) {
      setError("Não foi possível copiar a chave Pix");
      setTimeout(() => setError(""), 2000);
    }
  };

  const toggleCommissionSelection = (commission: Commission) => {
    if (commission.status !== "pending") return;

    const alreadySelected = selectedCommissionIds.includes(commission.id);
    if (alreadySelected) {
      setSelectedCommissionIds((prev) => prev.filter((id) => id !== commission.id));
      return;
    }

    if (selectedCommissionIds.length > 0) {
      const selected = filteredCommissions.find(
        (item) => item.id === selectedCommissionIds[0]
      );
      if (selected && selected.affiliate_id !== commission.affiliate_id) {
        setError("Selecione comissões do mesmo afiliado para pagamento em lote.");
        setTimeout(() => setError(""), 3000);
        return;
      }
    }

    setSelectedCommissionIds((prev) => [...prev, commission.id]);
  };

  const clearBatchSelection = () => {
    setSelectedCommissionIds([]);
    setBatchReceipt(null);
  };

  const markAsPaidBatch = async () => {
    if (selectedCommissionIds.length === 0) return;

    try {
      setIsBatchPaying(true);
      setError("");
      setSuccess("");

      const apiUrl = getApiUrl();
      const batchCommissions = filteredCommissions.filter((commission) =>
        selectedCommissionIds.includes(commission.id)
      );

      for (const commission of batchCommissions) {
        const formData = new FormData();
        formData.append("paid_method", "Pix");
        if (batchReceipt) {
          formData.append("receipt", batchReceipt);
        }

        const response = await fetchWithAuth(
          `${apiUrl}/api/admin/affiliates/${commission.affiliate_id}/commissions/${commission.id}/pay`,
          { method: "PUT", body: formData }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Erro ao registrar pagamento em lote");
        }
      }

      setSuccess("Pagamentos registrados com sucesso!");
      clearBatchSelection();
      loadReport();
    } catch (err) {
      setError("Erro ao registrar pagamento em lote");
    } finally {
      setIsBatchPaying(false);
    }
  };

  const exportToXLSX = (rows: Commission[]) => {
    const worksheetRows = [
      ["Data", "Afiliado", "Cliente", "CPF", "Valor", "Status", "Pago em", "Origem"],
      ...rows.map((c) => [
        new Date(c.created_at).toLocaleDateString("pt-BR"),
        c.affiliate_name,
        c.client_name,
        c.client_cpf,
        Number.parseFloat(c.amount),
        c.status === "paid" ? "Pago" : "Pendente",
        c.paid_at ? new Date(c.paid_at).toLocaleString("pt-BR") : "-",
        c.payment_reference || c.mp_payment_id || "-",
      ]),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Comissoes");

    XLSX.writeFile(
      workbook,
      `relatorio-comissoes-${selectedMonth}.xlsx`
    );
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

  const selectedMonthDate = new Date(`${selectedMonth}-01T00:00:00`);
  const periodStart = new Date(
    selectedMonthDate.getFullYear(),
    selectedMonthDate.getMonth(),
    1
  );
  const periodEnd = new Date(
    selectedMonthDate.getFullYear(),
    selectedMonthDate.getMonth() + 1,
    1
  );

  const getCommissionPeriodDate = (commission: Commission) => {
    if (commission.status === "paid") {
      return commission.paid_at || commission.created_at;
    }
    return commission.created_at;
  };

  const periodCommissions = data.commissions.filter((commission) => {
    const dateValue = getCommissionPeriodDate(commission);
    if (!dateValue) return false;
    const date = new Date(dateValue);
    return date >= periodStart && date < periodEnd;
  });

  const filteredCommissions = periodCommissions.filter((commission) => {
    if (filterStatus === "all") return true;
    return commission.status === filterStatus;
  });

  const filteredCommissionsBySearch = filteredCommissions.filter((commission) => {
    const term = affiliateSearchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      commission.affiliate_name.toLowerCase().includes(term) ||
      commission.affiliate_code.toLowerCase().includes(term)
    );
  });

  const periodTotals = periodCommissions.reduce(
    (acc, commission) => {
      const amount = Number.parseFloat(commission.amount) || 0;
      if (commission.status === "paid") {
        acc.paid += amount;
      } else {
        acc.pending += amount;
      }
      acc.total += amount;
      acc.count += 1;
      return acc;
    },
    { pending: 0, paid: 0, total: 0, count: 0 }
  );

  const affiliateSummary = periodCommissions.reduce((acc, commission) => {
    const amount = Number.parseFloat(commission.amount) || 0;
    const summary = acc.get(commission.affiliate_id) || {
      total_commissions_count: 0,
      pending_total: 0,
      paid_total: 0,
      total_amount: 0,
    };

    summary.total_commissions_count += 1;
    summary.total_amount += amount;
    if (commission.status === "paid") {
      summary.paid_total += amount;
    } else {
      summary.pending_total += amount;
    }

    acc.set(commission.affiliate_id, summary);
    return acc;
  }, new Map<number, { total_commissions_count: number; pending_total: number; paid_total: number; total_amount: number }>());

  const selectedMonthLabel = selectedMonthDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const pendingCommissions = periodCommissions.filter(
    (commission) => commission.status === "pending"
  );
  const pendingTotal = pendingCommissions.reduce((sum, commission) => {
    return sum + (Number.parseFloat(commission.amount) || 0);
  }, 0);

  const selectedCommissions = filteredCommissions.filter((commission) =>
    selectedCommissionIds.includes(commission.id)
  );
  const selectedTotal = selectedCommissions.reduce((sum, commission) => {
    return sum + (Number.parseFloat(commission.amount) || 0);
  }, 0);
  const selectedAffiliate =
    selectedCommissions.length > 0 ? selectedCommissions[0] : null;

  const affiliateForDetail = data.affiliates.find(
    (affiliate) => affiliate.id === selectedAffiliateId
  );
  const commissionsForAffiliate = filteredCommissions.filter(
    (commission) => commission.affiliate_id === selectedAffiliateId
  );
  const affiliatePendingTotal = commissionsForAffiliate.reduce((sum, commission) => {
    if (commission.status !== "pending") return sum;
    return sum + (Number.parseFloat(commission.amount) || 0);
  }, 0);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Relatório Financeiro de Afiliados
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Fechamento mensal de comissões
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Mês de referência</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <button
            onClick={() => exportToXLSX(filteredCommissions)}
            className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 mt-5 sm:mt-0"
          >
            <Download className="w-5 h-5 mr-2" />
            Exportar XLSX
          </button>
        </div>
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
              <p className="text-sm text-gray-600">Comissões no Mês</p>
              <p className="text-2xl font-bold text-gray-900">{periodTotals.count}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-yellow-100 p-3 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">A Pagar (Mês)</p>
              <p className="text-2xl font-bold text-yellow-600">
                R$ {periodTotals.pending.toFixed(2)}
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
              <p className="text-sm text-gray-600">Já Pago (Mês)</p>
              <p className="text-2xl font-bold text-green-600">
                R$ {periodTotals.paid.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Fechamento do Mês */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-sm border border-green-200 p-6">
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="w-6 h-6 text-green-600" />
          <h2 className="text-xl font-semibold text-gray-900">
            Fechamento do Mês
          </h2>
        </div>
        <p className="text-4xl font-bold text-green-600">
          R$ {periodTotals.total.toFixed(2)}
        </p>
        <p className="text-sm text-gray-600 mt-2">
          Total do mês de {selectedMonthLabel} ({periodStart.toLocaleDateString("pt-BR")} -{" "}
          {new Date(periodEnd.getTime() - 1).toLocaleDateString("pt-BR")})
        </p>
      </div>

      {selectedAffiliateId && affiliateForDetail && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Comissões de {affiliateForDetail.name}
              </h2>
              <p className="text-xs text-gray-500">
                Pix: {affiliateForDetail.pix_key || "não informado"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedAffiliateId(null);
                clearBatchSelection();
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Voltar ao resumo
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="p-4 border rounded-lg">
              <p className="text-xs text-gray-500">Total pendente</p>
              <p className="text-xl font-bold text-gray-900">
                R$ {affiliatePendingTotal.toFixed(2)}
              </p>
              <button
                type="button"
                onClick={() => copyPixKey(affiliateForDetail.pix_key)}
                className="mt-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                disabled={!affiliateForDetail.pix_key}
              >
                Copiar Pix
              </button>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-xs text-gray-500 mb-2">Comprovante (opcional)</p>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setBatchReceipt(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              <button
                type="button"
                onClick={markAsPaidBatch}
                className="mt-3 w-full px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                disabled={isBatchPaying || selectedCommissions.length === 0}
              >
                {isBatchPaying ? "Processando..." : "Registrar pagamento selecionado"}
              </button>
            </div>
            <div className="p-4 border rounded-lg text-sm text-gray-600">
              <p className="font-semibold text-gray-900 mb-1">Seleção</p>
              <p>Marque as comissões abaixo para pagar todas ou parcialmente.</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Seleção
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cadastro
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pagamento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {commissionsForAffiliate.length === 0 ? (
                  <tr>
                    <td className="px-6 py-8 text-center text-sm text-gray-500" colSpan={6}>
                      Nenhuma comissão encontrada para este afiliado.
                    </td>
                  </tr>
                ) : (
                  commissionsForAffiliate.map((commission) => (
                    <tr key={commission.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <input
                          type="checkbox"
                          checked={selectedCommissionIds.includes(commission.id)}
                          disabled={commission.status !== "pending"}
                          onChange={() => toggleCommissionSelection(commission)}
                          className="h-4 w-4 text-green-600 border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {commission.client_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {commission.client_created_at
                          ? new Date(commission.client_created_at).toLocaleDateString("pt-BR")
                          : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {commission.paid_at
                          ? new Date(commission.paid_at).toLocaleDateString("pt-BR")
                          : commission.created_at
                            ? new Date(commission.created_at).toLocaleDateString("pt-BR")
                            : "-"}
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Detalhes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.affiliates.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-center text-sm text-gray-500" colSpan={7}>
                    Nenhum afiliado encontrado.
                  </td>
                </tr>
              ) : (
                data.affiliates.map((affiliate) => {
                  const summary = affiliateSummary.get(affiliate.id) || {
                    total_commissions_count: 0,
                    pending_total: 0,
                    paid_total: 0,
                    total_amount: 0,
                  };

                  return (
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
                        {summary.total_commissions_count}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-yellow-600">
                        R$ {summary.pending_total.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600">
                        R$ {summary.paid_total.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        R$ {summary.total_amount.toFixed(2)}
                      </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAffiliateId(affiliate.id);
                          clearBatchSelection();
                        }}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        Ver comissões
                      </button>
                    </td>
                    </tr>
                  );
                })
              )}
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
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={affiliateSearchTerm}
                onChange={(e) => setAffiliateSearchTerm(e.target.value)}
                placeholder="Filtrar por afiliado"
                className="px-3 py-2 border rounded-lg text-sm"
              />
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Origem
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Comprovante
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCommissionsBySearch.length === 0 ? (
                <tr>
                  <td className="px-6 py-8 text-center text-sm text-gray-500" colSpan={9}>
                    Nenhuma comissão encontrada.
                  </td>
                </tr>
              ) : (
                filteredCommissionsBySearch.map((commission) => (
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
                    {commission.status === "pending" && (
                      <span className="ml-2 px-2 py-1 text-xs rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200">
                        Pendente do mês
                      </span>
                    )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {commission.paid_at
                        ? new Date(commission.paid_at).toLocaleString("pt-BR")
                        : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {commission.payment_reference || commission.mp_payment_id || "-"}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default AffiliateFinancialReport;
