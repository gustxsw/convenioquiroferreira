import type React from "react";
import { useState, useEffect } from "react";
import {
  BarChart2,
  Calendar,
  TrendingUp,
  Users,
  FileText,
  Activity,
} from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";

type DetailedReport = {
  summary: {
    total_consultations: number;
    convenio_consultations: number;
    private_consultations: number;
    total_revenue: number;
    convenio_revenue: number;
    private_revenue: number;
    professional_percentage: number;
    amount_to_pay: number;
    total_paid: number;
  };
};

type AnalyticsConsultation = {
  id: number;
  date: string;
  value: number;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
  payment_method: string | null;
  service_name: string;
  client_name: string;
  patient_type: "convenio" | "private" | "unknown";
};

type AnalyticsReport = {
  consultations: AnalyticsConsultation[];
  inactive_clients: {
    convenio: Array<{
      id: number;
      name: string;
      subscription_status: string | null;
      client_type: "titular" | "dependente";
    }>;
    private: Array<{
      id: number;
      name: string;
      is_active: boolean;
    }>;
  };
};

const ProfessionalReportsPage: React.FC = () => {
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [report, setReport] = useState<DetailedReport | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedReports, setSelectedReports] = useState<string[]>([
    "faturamento-periodo",
    "consultas-por-servico",
    "ranking-servicos",
  ]);

  // Get default date range (current month)
  function getDefaultStartDate() {
    const date = new Date();
    date.setDate(1); // First day of current month
    return date.toISOString().split("T")[0];
  }

  function getDefaultEndDate() {
    const date = new Date();
    return date.toISOString().split("T")[0];
  }

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    try {
      setIsLoading(true);
      setError("");

      const apiUrl = getApiUrl();

      console.log("🔄 Fetching detailed report with dates:", {
        startDate,
        endDate,
      });
      console.log(
        "🔄 Frontend dates being sent:",
        `start_date=${startDate}&end_date=${endDate}`
      );

      const response = await fetchWithAuth(
        `${apiUrl}/api/reports/professional-detailed?start_date=${startDate}&end_date=${endDate}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log("📡 Detailed report response status:", response.status);
      console.log(
        "📡 Response content-type:",
        response.headers.get("content-type")
      );

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await response.text();
        console.error(
          "❌ Response is not JSON:",
          textResponse.substring(0, 200)
        );
        throw new Error(
          "A rota da API não foi encontrada. Verifique se o endpoint '/api/reports/professional-detailed' está configurado corretamente no servidor."
        );
      }

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ Detailed report error:", errorData);
        throw new Error(errorData.message || "Falha ao carregar relatório");
      }

      const data = await response.json();
      console.log("✅ Detailed report data received:", data);
      setReport(data);

      // Fetch analytics (consultations breakdown, inactive clients)
      const analyticsResponse = await fetchWithAuth(
        `${apiUrl}/api/reports/professional-analytics?start_date=${startDate}&end_date=${endDate}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!analyticsResponse.ok) {
        const analyticsError = await analyticsResponse.json();
        console.error("❌ Analytics report error:", analyticsError);
      } else {
        const analyticsData = await analyticsResponse.json();
        console.log("✅ Analytics report data received:", analyticsData);
        setAnalytics(analyticsData);
      }
    } catch (error) {
      console.error("Error fetching report:", error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError(
          "Não foi possível carregar o relatório. Verifique sua conexão e tente novamente."
        );
      }
      setReport(null);
      setAnalytics(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR");
  };

  // Format date for display (convert from UTC to Brazil local time)
  const formatDateTimeFromUTC = (utcDateString: string) => {
    const date = new Date(utcDateString);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const nonCancelledConsultations =
    analytics?.consultations.filter((c) => c.status !== "cancelled") || [];

  const totalConsultationsAll = analytics?.consultations.length || 0;
  const cancelledCount =
    analytics?.consultations.filter((c) => c.status === "cancelled").length ||
    0;
  const cancellationRate =
    totalConsultationsAll > 0
      ? Math.round((cancelledCount / totalConsultationsAll) * 100)
      : 0;

  const groupBy = <T, K extends string | number>(
    items: T[],
    keyFn: (item: T) => K
  ): Record<K, T[]> => {
    return items.reduce((acc, item) => {
      const key = keyFn(item);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<K, T[]>);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Relatórios Profissionais
        </h1>
        <p className="text-gray-600">
          Visualize dados detalhados de suas consultas e faturamento
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 space-y-4">
        <div className="flex items-center mb-2">
          <Calendar className="h-6 w-6 text-red-600 mr-2" />
          <h2 className="text-xl font-semibold">Período & Relatórios</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="startDate"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Data Inicial
              </label>
              <input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input"
                required
              />
            </div>

            <div>
              <label
                htmlFor="endDate"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Data Final
              </label>
              <input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input"
                required
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className={`btn btn-primary w-full ${
                  isLoading ? "opacity-70 cursor-not-allowed" : ""
                }`}
                disabled={isLoading}
              >
                {isLoading ? "Carregando..." : "Gerar Relatório"}
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">
              Escolha quais relatórios deseja gerar:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
              {[
                { id: "faturamento-periodo", label: "1️⃣ Faturamento por período / 10️⃣ Resumo" },
                { id: "consultas-por-servico", label: "2️⃣ Consultas por serviço" },
                { id: "consultas-por-cliente", label: "3️⃣ Consultas por cliente" },
                { id: "ranking-servicos", label: "4️⃣ Ranking de serviços" },
                { id: "ranking-clientes", label: "5️⃣ Ranking de clientes" },
                { id: "taxa-cancelados", label: "6️⃣ Taxa de cancelados" },
                { id: "horarios-movimentados", label: "7️⃣ Horários mais movimentados" },
                { id: "receita-forma-pagamento", label: "8️⃣ Receita por forma de pagamento" },
                { id: "clientes-inativos", label: "9️⃣ Clientes inativos" },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className="flex items-center space-x-2 text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={selectedReports.includes(opt.id)}
                    onChange={(e) => {
                      setSelectedReports((prev) =>
                        e.target.checked
                          ? [...prev, opt.id]
                          : prev.filter((id) => id !== opt.id)
                      );
                    }}
                    className="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </form>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {report && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">
                  Total de Consultas
                </h3>
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {report.summary.total_consultations}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Todas as consultas realizadas
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">
                  Consultas Convênio
                </h3>
                <FileText className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {report.summary.convenio_consultations}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Atendimentos pelo convênio
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">
                  Consultas Particulares
                </h3>
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {report.summary.private_consultations}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Atendimentos particulares
              </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">
                  Faturamento Total
                </h3>
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(report.summary.total_revenue)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Receita bruta do período
              </p>
            </div>
          </div>

          {/* 1️⃣ Faturamento por período / 10️⃣ Resumo do período */}
          {selectedReports.includes("faturamento-periodo") && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center mb-6">
              <BarChart2 className="h-6 w-6 text-red-600 mr-2" />
              <h2 className="text-xl font-semibold">
                1️⃣ Faturamento por Período & 🔟 Resumo do Período
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-center">
                  <p className="text-gray-600 mb-1">Receita do Convênio</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatCurrency(report.summary.convenio_revenue)}
                  </p>
                  <p className="text-sm text-gray-500">
                    Atendimentos pelo convênio
                  </p>
                </div>
              </div>

              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="text-center">
                  <p className="text-gray-600 mb-1">Receita Particular</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {formatCurrency(report.summary.private_revenue)}
                  </p>
                  <p className="text-sm text-gray-500">
                    100% para o profissional
                  </p>
                </div>
              </div>

              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-center">
                  <p className="text-gray-600 mb-1">Sua Porcentagem</p>
                  <p className="text-2xl font-bold text-green-600">
                    {report.summary.professional_percentage}%
                  </p>
                  <p className="text-sm text-gray-500">
                    Do faturamento do convênio
                  </p>
                </div>
              </div>

              <div className="p-4 bg-red-50 rounded-lg">
                <div className="text-center">
                  <p className="text-gray-600 mb-1">Valor a Pagar</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(report.summary.amount_to_pay)}
                  </p>
                  <p className="text-sm text-gray-500">Para o convênio</p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3">
                Resumo do Período
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p>
                    <strong>Período:</strong>{" "}
                    {startDate
                      ? new Date(startDate + "T12:00:00").toLocaleDateString(
                          "pt-BR"
                        )
                      : ""}{" "}
                    a{" "}
                    {endDate
                      ? new Date(endDate + "T12:00:00").toLocaleDateString(
                          "pt-BR"
                        )
                      : ""}
                  </p>
                  <p>
                    <strong>Total de Consultas:</strong>{" "}
                    {report.summary.total_consultations}
                  </p>
                  <p>
                    <strong>Faturamento Bruto:</strong>{" "}
                    {formatCurrency(report.summary.total_revenue)}
                  </p>
                </div>
                <div>
                  <p>
                    <strong>Receita Líquida:</strong>{" "}
                    {formatCurrency(
                      report.summary.private_revenue +
                        report.summary.convenio_revenue *
                          (report.summary.professional_percentage / 100)
                    )}
                  </p>
                  <p>
                    <strong>Repasse ao Convênio:</strong>{" "}
                    {formatCurrency(report.summary.amount_to_pay)}
                  </p>
                  <p>
                    <strong>Porcentagem do Convênio:</strong>{" "}
                    {100 - report.summary.professional_percentage}%
                  </p>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* 2️⃣ Consultas por serviço & 4️⃣ Ranking de serviços */}
          {analytics &&
            analytics.consultations.length > 0 &&
            selectedReports.includes("consultas-por-servico") &&
            selectedReports.includes("ranking-servicos") && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center mb-4">
                <FileText className="h-5 w-5 text-red-600 mr-2" />
                <h3 className="text-lg font-semibold">
                  2️⃣ Consultas por Serviço & 4️⃣ Ranking de Serviços
                </h3>
              </div>
              {(() => {
                const byService = groupBy(nonCancelledConsultations, (c) =>
                  c.service_name || "Sem serviço"
                );
                const rows = Object.entries(byService).map(
                  ([serviceName, list]) => ({
                    serviceName,
                    consultations: list.length,
                    revenue: list.reduce(
                      (sum, item) => sum + Number(item.value || 0),
                      0
                    ),
                  })
                );
                const sorted = rows.sort(
                  (a, b) => b.consultations - a.consultations
                );
                const top5 = sorted.slice(0, 5);
                return (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Top 5 serviços mais realizados no período.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">
                              Serviço
                            </th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500">
                              Consultas
                            </th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500">
                              Faturamento
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {top5.map((row) => (
                            <tr key={row.serviceName}>
                              <td className="px-4 py-2 text-gray-900">
                                {row.serviceName}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {row.consultations}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {formatCurrency(row.revenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 3️⃣ Consultas por cliente & 5️⃣ Ranking de clientes */}
          {analytics &&
            analytics.consultations.length > 0 &&
            selectedReports.includes("consultas-por-cliente") &&
            selectedReports.includes("ranking-clientes") && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center mb-4">
                <Users className="h-5 w-5 text-blue-600 mr-2" />
                <h3 className="text-lg font-semibold">
                  3️⃣ Consultas por Cliente & 5️⃣ Ranking de Clientes
                </h3>
              </div>
              {(() => {
                const byClient = groupBy(nonCancelledConsultations, (c) =>
                  c.client_name || "Desconhecido"
                );
                const rows = Object.entries(byClient).map(
                  ([clientName, list]) => ({
                    clientName,
                    consultations: list.length,
                    revenue: list.reduce(
                      (sum, item) => sum + Number(item.value || 0),
                      0
                    ),
                  })
                );
                const sorted = rows.sort(
                  (a, b) => b.consultations - a.consultations
                );
                const top5 = sorted.slice(0, 5);
                return (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Top 5 clientes com mais consultas no período.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-500">
                              Cliente
                            </th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500">
                              Consultas
                            </th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500">
                              Faturamento
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {top5.map((row) => (
                            <tr key={row.clientName}>
                              <td className="px-4 py-2 text-gray-900">
                                {row.clientName}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {row.consultations}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {formatCurrency(row.revenue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 6️⃣ Taxa de cancelados */}
          {analytics &&
            totalConsultationsAll > 0 &&
            selectedReports.includes("taxa-cancelados") && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center mb-4">
                <Activity className="h-5 w-5 text-yellow-600 mr-2" />
                <h3 className="text-lg font-semibold">6️⃣ Taxa de Cancelados</h3>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                Consultas canceladas em relação ao total no período.
              </p>
              <div className="flex items-center space-x-6">
                <div>
                  <p className="text-3xl font-bold text-red-600">
                    {cancellationRate}%
                  </p>
                  <p className="text-sm text-gray-500">
                    {cancelledCount} de {totalConsultationsAll} consultas
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 7️⃣ Horários mais movimentados */}
          {analytics &&
            analytics.consultations.length > 0 &&
            selectedReports.includes("horarios-movimentados") && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center mb-4">
                <Clock className="h-5 w-5 text-indigo-600 mr-2" />
                <h3 className="text-lg font-semibold">
                  7️⃣ Horários mais movimentados
                </h3>
              </div>
              {(() => {
                const byHour = groupBy(nonCancelledConsultations, (c) => {
                  const d = new Date(c.date);
                  return d.getHours();
                });
                const rows = Object.entries(byHour).map(([hour, list]) => ({
                  hour: Number(hour),
                  consultations: list.length,
                }));
                const sorted = rows.sort(
                  (a, b) => b.consultations - a.consultations
                );
                const top5 = sorted.slice(0, 5);
                return (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Faixas de horário com maior volume de consultas.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {top5.map((row) => (
                        <div
                          key={row.hour}
                          className="px-4 py-2 bg-indigo-50 rounded-full text-sm text-indigo-800 flex items-center space-x-2"
                        >
                          <span>
                            {String(row.hour).padStart(2, "0")}:00 -
                            {String(row.hour + 1).padStart(2, "0")}:00
                          </span>
                          <span className="text-xs text-gray-500">
                            ({row.consultations} consultas)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 8️⃣ Receita por forma de pagamento */}
          {analytics &&
            analytics.consultations.length > 0 &&
            selectedReports.includes("receita-forma-pagamento") && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center mb-4">
                <TrendingUp className="h-5 w-5 text-emerald-600 mr-2" />
                <h3 className="text-lg font-semibold">
                  8️⃣ Receita por Forma de Pagamento
                </h3>
              </div>
              {(() => {
                const byPayment = groupBy(nonCancelledConsultations, (c) =>
                  c.payment_method || "Não informado"
                );
                const rows = Object.entries(byPayment).map(
                  ([method, list]) => ({
                    method,
                    consultations: list.length,
                    revenue: list.reduce(
                      (sum, item) => sum + Number(item.value || 0),
                      0
                    ),
                  })
                );
                const sorted = rows.sort((a, b) => b.revenue - a.revenue);
                return (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-500">
                            Forma de Pagamento
                          </th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">
                            Consultas
                          </th>
                          <th className="px-4 py-2 text-right font-medium text-gray-500">
                            Receita
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sorted.map((row) => (
                          <tr key={row.method}>
                            <td className="px-4 py-2 text-gray-900">
                              {row.method}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {row.consultations}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {formatCurrency(row.revenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 9️⃣ Clientes inativos */}
          {analytics &&
            selectedReports.includes("clientes-inativos") &&
            (analytics.inactive_clients.convenio.length > 0 ||
              analytics.inactive_clients.private.length > 0) && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-center mb-4">
                  <Users className="h-5 w-5 text-gray-600 mr-2" />
                  <h3 className="text-lg font-semibold">9️⃣ Clientes Inativos</h3>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Clientes vinculados ao profissional que estão com status
                  inativo (convênio) ou desativados (particulares).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">
                      Convênio
                    </h4>
                    {analytics.inactive_clients.convenio.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Nenhum cliente convênio inativo encontrado.
                      </p>
                    ) : (
                      <ul className="space-y-1 text-sm text-gray-700">
                        {analytics.inactive_clients.convenio.map((c) => (
                          <li key={`${c.client_type}-${c.id}`}>
                            <span className="font-medium">{c.name}</span>{" "}
                            <span className="text-xs text-gray-500">
                              ({c.client_type}) -{" "}
                              {c.subscription_status || "status desconhecido"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-2">
                      Pacientes Particulares
                    </h4>
                    {analytics.inactive_clients.private.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Nenhum paciente particular inativo encontrado.
                      </p>
                    ) : (
                      <ul className="space-y-1 text-sm text-gray-700">
                        {analytics.inactive_clients.private.map((p) => (
                          <li key={p.id}>
                            <span className="font-medium">{p.name}</span>{" "}
                            <span className="text-xs text-gray-500">
                              (desativado)
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default ProfessionalReportsPage;
