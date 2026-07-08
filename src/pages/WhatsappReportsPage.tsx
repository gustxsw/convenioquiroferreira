import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import {
  MessageCircle,
  Users,
  DollarSign,
  Headphones,
  Download,
  FileText,
  Search,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { fetchWithAuth, getApiUrl } from "../utils/apiHelpers";
import PieChart from "../components/PieChart";
import BarChart from "../components/BarChart";

type WhatsappReport = {
  periodo: { start: string; end: string; granularity: string };
  escopo: "convenio" | "professional";
  total_atendimentos: number;
  serie_temporal: Array<{ data: string; n: number }>;
  por_tipo_fluxo: Array<{ intent: string; n: number; pct: number }>;
  horario_pico: Array<{ hora: number; n: number }>;
  novos_pacientes: { conveniados: number; particulares: number };
  transferidos_humano: { total: number; por_motivo: Array<{ motivo: string; n: number }> };
  custo_ia: {
    conversas: number;
    input_tokens: number;
    output_tokens: number;
    custo_usd: number;
    custo_brl: number;
    usd_brl_rate: number;
  };
};

const INTENT_LABELS: Record<string, string> = {
  AGENDAR: "Agendamento",
  REAGENDAR: "Reagendamento",
  CANCELAR: "Cancelamento",
  CONVENIO: "Dúvida (convênio)",
  SAUDACAO: "Saudação",
  DESCONHECIDA: "Desconhecida",
};

const FLOW_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#6b7280"];

const formatCurrencyBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const firstDayOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA");
};
const today = () => new Date().toLocaleDateString("en-CA");

const WhatsappReportsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.currentRole === "admin";

  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(today());
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");
  const [report, setReport] = useState<WhatsappReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchReport = async () => {
    if (startDate > endDate) {
      setError("A data inicial não pode ser maior que a final.");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      const apiUrl = getApiUrl();
      const qs = `start_date=${startDate}&end_date=${endDate}&granularity=${granularity}`;
      const response = await fetchWithAuth(`${apiUrl}/api/whatsapp/reports?${qs}`);
      if (!response.ok) throw new Error("Falha ao carregar relatório");
      setReport(await response.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar relatório");
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport();
  };

  const exportExcel = () => {
    if (!report) return;
    const wb = XLSX.utils.book_new();
    const resumo = [
      ["Relatório de Atendimento — WhatsApp"],
      ["Período", `${startDate} a ${endDate}`],
      ["Escopo", report.escopo === "convenio" ? "Convênio (agregado)" : user?.name || "Profissional"],
      [],
      ["Total de atendimentos", report.total_atendimentos],
      ["Novos conveniados", report.novos_pacientes.conveniados],
      ["Novos particulares", report.novos_pacientes.particulares],
      ["Conversas transferidas", report.transferidos_humano.total],
      [],
      ["Custo da IA"],
      ["Conversas com IA", report.custo_ia.conversas],
      ["Tokens de entrada", report.custo_ia.input_tokens],
      ["Tokens de saída", report.custo_ia.output_tokens],
      ["Custo (US$)", report.custo_ia.custo_usd],
      ["Custo (R$)", report.custo_ia.custo_brl],
      ["Cotação USD→BRL", report.custo_ia.usd_brl_rate],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");

    const fluxo = [["Tipo", "Qtd", "%"], ...report.por_tipo_fluxo.map((r) => [
      INTENT_LABELS[r.intent] || r.intent,
      r.n,
      r.pct,
    ])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fluxo), "Tipo de fluxo");

    const pico = [["Hora", "Mensagens"], ...report.horario_pico.map((r) => [`${r.hora}h`, r.n])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pico), "Horário de pico");

    const serie = [["Data", "Atendimentos"], ...report.serie_temporal.map((r) => [r.data, r.n])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(serie), "Série temporal");

    XLSX.writeFile(wb, `relatorio-atendimento-${startDate}_${endDate}.xlsx`);
  };

  const exportPdf = async () => {
    try {
      const apiUrl = getApiUrl();
      const qs = `start_date=${startDate}&end_date=${endDate}&granularity=${granularity}`;
      const response = await fetchWithAuth(`${apiUrl}/api/whatsapp/reports/pdf?${qs}`);
      if (!response.ok) throw new Error("Falha ao gerar PDF");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-atendimento-${startDate}_${endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar PDF");
    }
  };

  const fluxoData = (report?.por_tipo_fluxo || []).map((r, i) => ({
    label: INTENT_LABELS[r.intent] || r.intent,
    value: r.n,
    color: FLOW_COLORS[i % FLOW_COLORS.length],
  }));
  const picoData = (report?.horario_pico || []).map((r) => ({
    label: `${r.hora}h`,
    value: r.n,
    color: "#ef4444",
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-red-600" />
          Relatórios de Atendimento
        </h1>
        <p className="text-gray-600">
          {isAdmin
            ? "Visão agregada dos atendimentos do convênio via WhatsApp."
            : "Seus atendimentos via WhatsApp."}
        </p>
      </div>

      {/* Filtros */}
      <form onSubmit={handleSubmit} className="card mb-6">
        <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data inicial</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data final</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agrupar por</label>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as "day" | "week" | "month")}
              className="input"
            >
              <option value="day">Dia</option>
              <option value="week">Semana</option>
              <option value="month">Mês</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary flex items-center" disabled={isLoading}>
            <Search className="h-4 w-4 mr-2" />
            {isLoading ? "Carregando..." : "Gerar"}
          </button>
          {report && (
            <div className="flex gap-2 sm:ml-auto">
              <button type="button" onClick={exportExcel} className="btn btn-outline flex items-center">
                <Download className="h-4 w-4 mr-2" /> Excel
              </button>
              <button type="button" onClick={exportPdf} className="btn btn-outline flex items-center">
                <FileText className="h-4 w-4 mr-2" /> PDF
              </button>
            </div>
          )}
        </div>
      </form>

      {error && <div className="mb-6 bg-red-50 text-red-600 p-3 rounded-lg">{error}</div>}

      {report && !isLoading && (
        <>
          {/* Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="card bg-blue-50">
              <div className="flex items-center gap-2 text-blue-700">
                <MessageCircle className="h-5 w-5" />
                <span className="text-sm font-medium">Atendimentos</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-2">{report.total_atendimentos}</p>
            </div>
            <div className="card bg-green-50">
              <div className="flex items-center gap-2 text-green-700">
                <Users className="h-5 w-5" />
                <span className="text-sm font-medium">Novos pacientes</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {report.novos_pacientes.conveniados + report.novos_pacientes.particulares}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {report.novos_pacientes.conveniados} conv. · {report.novos_pacientes.particulares} part.
              </p>
            </div>
            <div className="card bg-amber-50">
              <div className="flex items-center gap-2 text-amber-700">
                <Headphones className="h-5 w-5" />
                <span className="text-sm font-medium">Transferidas p/ humano</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-2">{report.transferidos_humano.total}</p>
            </div>
            <div className="card bg-purple-50">
              <div className="flex items-center gap-2 text-purple-700">
                <DollarSign className="h-5 w-5" />
                <span className="text-sm font-medium">Custo da IA</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrencyBRL(report.custo_ia.custo_brl)}</p>
              <p className="text-xs text-gray-600 mt-1">US$ {report.custo_ia.custo_usd.toFixed(4)}</p>
            </div>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Conversas por tipo de fluxo</h2>
              <PieChart data={fluxoData} />
            </div>
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Horário de pico (mensagens por hora)</h2>
              <BarChart data={picoData} />
            </div>
          </div>

          {/* Custo da IA detalhado */}
          <div className="card mb-6">
            <h2 className="text-lg font-semibold mb-4">Custo da Inteligência Artificial</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Conversas com IA</p>
                <p className="font-semibold">{report.custo_ia.conversas}</p>
              </div>
              <div>
                <p className="text-gray-500">Tokens entrada</p>
                <p className="font-semibold">{report.custo_ia.input_tokens.toLocaleString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-gray-500">Tokens saída</p>
                <p className="font-semibold">{report.custo_ia.output_tokens.toLocaleString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-gray-500">Custo (US$)</p>
                <p className="font-semibold">US$ {report.custo_ia.custo_usd.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-gray-500">Custo (R$)</p>
                <p className="font-semibold">{formatCurrencyBRL(report.custo_ia.custo_brl)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              * Estimativa em reais pela cotação configurada (USD→BRL {report.custo_ia.usd_brl_rate}).
            </p>
          </div>

          {/* Transferências por motivo */}
          {report.transferidos_humano.por_motivo.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Conversas transferidas por motivo</h2>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2">Motivo</th>
                    <th className="py-2">Qtd</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {report.transferidos_humano.por_motivo.map((r) => (
                    <tr key={r.motivo}>
                      <td className="py-2">{r.motivo}</td>
                      <td className="py-2">{r.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WhatsappReportsPage;
