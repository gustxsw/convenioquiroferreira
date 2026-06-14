import React, { useState, useEffect } from "react";
import { Calendar, DollarSign, Users, Percent, Link2, Check } from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";

type AgendaFinancialResponse = {
  period: {
    start_date: string;
    end_date: string;
  };
  summary: {
    total_payments: number;
    total_amount: number;
  };
  by_professional: Array<{
    professional_id: number;
    professional_name: string;
    payments_count: number;
    total_amount: number;
  }>;
  partner?: {
    is_partner: boolean;
    percentage?: number | null;
    commission_amount?: number;
    code?: string | null;
  };
};

type Commission = {
  id: number;
  professional_name: string;
  amount: number;
  percentage: number;
  status: "paid" | "pending";
  paid_at: string | null;
  paid_method: string | null;
  paid_receipt_url: string | null;
};

const AgendaFinancialPage: React.FC = () => {
  const getDefaultStartDate = () => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().split("T")[0];
  };

  const getDefaultEndDate = () => new Date().toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AgendaFinancialResponse | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [copied, setCopied] = useState(false);

  const partnerLink = data?.partner?.code
    ? `${window.location.origin}/register?partner=${encodeURIComponent(
        data.partner.code
      )}`
    : "";

  const copyPartnerLink = async () => {
    if (!partnerLink) return;
    try {
      await navigator.clipboard.writeText(partnerLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* área de transferência indisponível: o link continua visível para cópia manual */
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);

  const fetchSummary = async () => {
    try {
      setIsLoading(true);
      setError("");

      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/agenda-financial/summary?start_date=${startDate}&end_date=${endDate}`,
        { method: "GET" }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao carregar resumo financeiro");
      }

      const responseData = await response.json();
      setData(responseData);

      // Parceiro também vê a lista de comissões (pendentes + pagas) com
      // comprovante. Filtra pelo mesmo período selecionado.
      if (responseData?.partner?.is_partner) {
        const commissionsResponse = await fetchWithAuth(
          `${apiUrl}/api/agenda-financial/commissions?start_date=${startDate}&end_date=${endDate}`,
          { method: "GET" }
        );
        if (commissionsResponse.ok) {
          const commissionsData = await commissionsResponse.json();
          setCommissions(commissionsData.commissions || []);
        } else {
          setCommissions([]);
        }
      } else {
        setCommissions([]);
      }
    } catch (err) {
      setData(null);
      setCommissions([]);
      setError(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSummary();
  };

  // Carrega o resumo automaticamente ao abrir (mês atual), para o parceiro já
  // ver seus números e o link de indicação sem precisar clicar em "Buscar".
  useEffect(() => {
    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Financeiro da Agenda</h1>
        <p className="text-gray-600">
          {data?.partner?.is_partner
            ? "Acompanhe os pagamentos de agenda dos profissionais sob sua responsabilidade"
            : "Acompanhe os pagamentos de agenda dos profissionais"}
        </p>
      </div>

      {data?.partner?.is_partner && partnerLink && (
        <div className="card mb-6 border-blue-200 bg-blue-50">
          <div className="flex items-center mb-2 text-blue-800">
            <Link2 className="h-5 w-5 mr-2" />
            <h2 className="text-lg font-semibold">Seu link de indicação</h2>
          </div>
          <p className="text-sm text-blue-800 mb-3">
            Compartilhe este link com profissionais. Quem se cadastrar por ele
            entra automaticamente sob a sua responsabilidade.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={partnerLink}
              readOnly
              onFocus={(e) => e.target.select()}
              className="flex-1 px-3 py-2 border border-blue-200 rounded-lg bg-white text-sm text-gray-700"
            />
            <button
              type="button"
              onClick={copyPartnerLink}
              className="btn btn-primary flex items-center justify-center whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copiado!
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 mr-2" />
                  Copiar link
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="card mb-6">
        <div className="flex items-center mb-4">
          <Calendar className="h-5 w-5 text-red-600 mr-2" />
          <h2 className="text-lg font-semibold">Período</h2>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input"
            required
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="input"
            required
          />
          <button
            type="submit"
            className={`btn btn-primary ${isLoading ? "opacity-70 cursor-not-allowed" : ""}`}
            disabled={isLoading}
          >
            {isLoading ? "Carregando..." : "Consultar"}
          </button>
        </form>
      </div>

      {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>}

      {data && (
        <div className="space-y-6">
          <div
            className={`grid grid-cols-1 gap-4 ${
              data.partner?.is_partner ? "md:grid-cols-3" : "md:grid-cols-2"
            }`}
          >
            <div className="card">
              <div className="flex items-center text-gray-600 mb-2">
                <DollarSign className="h-5 w-5 mr-2 text-green-600" />
                <span>Total Recebido</span>
              </div>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(data.summary.total_amount)}
              </p>
            </div>

            <div className="card">
              <div className="flex items-center text-gray-600 mb-2">
                <Users className="h-5 w-5 mr-2 text-blue-600" />
                <span>Total de Pagamentos</span>
              </div>
              <p className="text-3xl font-bold text-blue-600">
                {data.summary.total_payments}
              </p>
            </div>

            {data.partner?.is_partner && (
              <div className="card">
                <div className="flex items-center text-gray-600 mb-2">
                  <Percent className="h-5 w-5 mr-2 text-red-600" />
                  <span>
                    Sua comissão de parceria
                    {data.partner.percentage != null
                      ? ` (${data.partner.percentage}%)`
                      : ""}
                  </span>
                </div>
                <p className="text-3xl font-bold text-red-600">
                  {formatCurrency(data.partner.commission_amount || 0)}
                </p>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Por Profissional</h3>
            {data.by_professional.length === 0 ? (
              <p className="text-gray-600">Nenhum pagamento aprovado no período.</p>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Profissional</th>
                      <th>Qtd. Pagamentos</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_professional.map((item) => (
                      <tr key={item.professional_id}>
                        <td>{item.professional_name}</td>
                        <td>{item.payments_count}</td>
                        <td>{formatCurrency(item.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {data.partner?.is_partner && (
            <div className="card">
              <h3 className="text-lg font-semibold mb-4">Comissões</h3>
              {commissions.length === 0 ? (
                <p className="text-gray-600">Nenhuma comissão no período.</p>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Profissional</th>
                        <th>Valor</th>
                        <th>%</th>
                        <th>Status</th>
                        <th>Comprovante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map((commission) => (
                        <tr key={commission.id}>
                          <td>{commission.professional_name}</td>
                          <td>{formatCurrency(commission.amount)}</td>
                          <td>{commission.percentage}%</td>
                          <td>
                            <span
                              className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                                commission.status === "paid"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-yellow-100 text-yellow-800"
                              }`}
                            >
                              {commission.status === "paid"
                                ? "Pago"
                                : "Pendente"}
                            </span>
                            {commission.status === "paid" &&
                              commission.paid_at && (
                                <span className="block text-xs text-gray-400 mt-1">
                                  {new Date(
                                    commission.paid_at
                                  ).toLocaleDateString("pt-BR")}
                                  {commission.paid_method
                                    ? ` · ${commission.paid_method}`
                                    : ""}
                                </span>
                              )}
                          </td>
                          <td>
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
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgendaFinancialPage;
