"use client";

import type React from "react";
import { useState } from "react";
import {
  BarChart2,
  Download,
  Calendar,
  MapPin,
  Users,
  Building,
} from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";

type RevenueReport = {
  total_revenue: number;
  total_consultations_value: number;
  revenue_by_professional: {
    professional_name: string;
    professional_percentage: number;
    revenue: number;
    consultation_count: number;
    professional_payment: number;
    clinic_revenue: number;
  }[];
  revenue_by_service: {
    service_name: string;
    revenue: number;
    consultation_count: number;
  }[];
};

type CityReport = {
  city: string;
  state: string;
  client_count: number;
  active_clients: number;
  pending_clients: number;
  expired_clients: number;
};

type ProfessionalCityReport = {
  city: string;
  state: string;
  total_professionals: number;
  categories: {
    category_name: string;
    count: number;
  }[];
};

type AgendaFinancialReport = {
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
    name?: string | null;
  };
};

type AgendaPartnerOption = {
  id: number;
  name: string;
  percentage: number | null;
};

const ReportsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    "revenue" | "clients" | "professionals" | "agenda_financial"
  >("revenue");
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [clientsReport, setClientsReport] = useState<CityReport[]>([]);
  const [professionalsReport, setProfessionalsReport] = useState<
    ProfessionalCityReport[]
  >([]);
  const [agendaFinancialReport, setAgendaFinancialReport] =
    useState<AgendaFinancialReport | null>(null);
  const [agendaPartners, setAgendaPartners] = useState<AgendaPartnerOption[]>(
    []
  );
  const [selectedAgendaPartnerId, setSelectedAgendaPartnerId] = useState("");

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

  const fetchReport = async () => {
    if (startDate > endDate) {
      setError("A data inicial não pode ser maior que a data final");
      return;
    }

    try {
      setIsLoading(true);
      setError("");

      const apiUrl = getApiUrl();

      console.log(
        "🔄 Fetching revenue report from:",
        `${apiUrl}/api/reports/revenue`
      );
      console.log("🔄 Frontend date range being sent:", { startDate, endDate });
      console.log(
        "🔄 URL being called:",
        `${apiUrl}/api/reports/revenue?start_date=${startDate}&end_date=${endDate}`
      );

      const response = await fetchWithAuth(
        `${apiUrl}/api/reports/revenue?start_date=${startDate}&end_date=${endDate}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log("📡 Revenue report response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Revenue report error details:", errorText);
        throw new Error(
          `Falha ao carregar relatório de receita: ${response.status}`
        );
      }

      const data = await response.json();
      console.log("✅ Revenue report data:", data);
      setReport(data);
    } catch (error) {
      console.error("Error fetching report:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o relatório de receita"
      );
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReport();
  };

  const fetchCityReports = async () => {
    try {
      setIsLoading(true);
      setError("");

      const apiUrl = getApiUrl();

      console.log(
        "🔄 Fetching city reports from:",
        `${apiUrl}/api/reports/clients-by-city`
      );

      // Fetch clients by city
      const clientsResponse = await fetchWithAuth(
        `${apiUrl}/api/reports/clients-by-city`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log(
        "📡 Clients by city response status:",
        clientsResponse.status
      );

      if (clientsResponse.ok) {
        const clientsData = await clientsResponse.json();
        console.log("✅ Clients by city loaded:", clientsData);
        setClientsReport(clientsData);
      } else {
        console.warn(
          "⚠️ Clients by city not available:",
          clientsResponse.status
        );
        setClientsReport([]);
      }

      // Fetch professionals by city
      const professionalsResponse = await fetchWithAuth(
        `${apiUrl}/api/reports/professionals-by-city`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log(
        "📡 Professionals by city response status:",
        professionalsResponse.status
      );

      if (professionalsResponse.ok) {
        const professionalsData = await professionalsResponse.json();
        console.log("✅ Professionals by city loaded:", professionalsData);
        setProfessionalsReport(professionalsData);
      } else {
        console.warn(
          "⚠️ Professionals by city not available:",
          professionalsResponse.status
        );
        setProfessionalsReport([]);
      }
    } catch (error) {
      console.error("Error fetching city reports:", error);
      setError("Não foi possível carregar os relatórios por cidade");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (
    tab: "revenue" | "clients" | "professionals" | "agenda_financial"
  ) => {
    setActiveTab(tab);
    if (tab === "clients" || tab === "professionals") {
      fetchCityReports();
    }
    if (tab === "agenda_financial") {
      fetchAgendaPartners();
      fetchAgendaFinancialReport();
    }
  };

  const fetchAgendaPartners = async () => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/agenda-partners`
      );
      if (!response.ok) return;
      const data = await response.json();
      setAgendaPartners(
        Array.isArray(data)
          ? data.map((p: { id: number; name: string; percentage: number | null }) => ({
              id: p.id,
              name: p.name,
              percentage: p.percentage,
            }))
          : []
      );
    } catch {
      /* silencioso: o seletor de parceiro apenas fica vazio */
    }
  };

  const fetchAgendaFinancialReport = async () => {
    if (startDate > endDate) {
      setError("A data inicial não pode ser maior que a data final");
      return;
    }

    try {
      setIsLoading(true);
      setError("");

      const apiUrl = getApiUrl();
      const partnerParam = selectedAgendaPartnerId
        ? `&partner_id=${selectedAgendaPartnerId}`
        : "";
      const response = await fetchWithAuth(
        `${apiUrl}/api/agenda-financial/summary?start_date=${startDate}&end_date=${endDate}${partnerParam}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Falha ao carregar relatório financeiro da agenda"
        );
      }

      const data = await response.json();
      setAgendaFinancialReport(data);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o relatório da agenda"
      );
      setAgendaFinancialReport(null);
    } finally {
      setIsLoading(false);
    }
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

  const calculateTotalClinicRevenue = () => {
    if (!report) return 0;
    if (
      !report.revenue_by_professional ||
      !Array.isArray(report.revenue_by_professional)
    )
      return 0;
    console.log(
      "🔄 Calculating clinic revenue from:",
      report.revenue_by_professional
    );
    return report.revenue_by_professional.reduce(
      (total, prof) => total + (Number(prof.clinic_revenue) || 0),
      0
    );
  };

  const calculateTotalProfessionalPayments = () => {
    if (!report) return 0;
    if (
      !report.revenue_by_professional ||
      !Array.isArray(report.revenue_by_professional)
    )
      return 0;
    console.log(
      "🔄 Calculating professional payments from:",
      report.revenue_by_professional
    );
    return report.revenue_by_professional.reduce(
      (total, prof) => total + (Number(prof.professional_payment) || 0),
      0
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-gray-600">
          Visualize dados de faturamento e distribuição geográfica
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => handleTabChange("revenue")}
            className={`px-6 py-4 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "revenue"
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <BarChart2 className="h-5 w-5 inline mr-2" />
            Relatório Financeiro
          </button>
          <button
            onClick={() => handleTabChange("clients")}
            className={`px-6 py-4 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "clients"
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Users className="h-5 w-5 inline mr-2" />
            Clientes por Cidade
          </button>
          <button
            onClick={() => handleTabChange("professionals")}
            className={`px-6 py-4 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "professionals"
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Building className="h-5 w-5 inline mr-2" />
            Profissionais por Cidade
          </button>
          <button
            onClick={() => handleTabChange("agenda_financial")}
            className={`px-6 py-4 font-medium text-sm border-b-2 transition-colors ${
              activeTab === "agenda_financial"
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <BarChart2 className="h-5 w-5 inline mr-2" />
            Financeiro da Agenda
          </button>
        </div>
      </div>

      {/* Revenue Report Tab */}
      {activeTab === "revenue" && (
        <>
          <div className="card mb-6">
            <div className="flex items-center mb-4">
              <Calendar className="h-6 w-6 text-red-600 mr-2" />
              <h2 className="text-xl font-semibold">Selecione o Período</h2>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
            </form>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6">
              {error}
            </div>
          )}

          {report && (
            <div className="space-y-6">
              <div className="card">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center">
                    <BarChart2 className="h-6 w-6 text-red-600 mr-2" />
                    <h2 className="text-xl font-semibold">Resumo do Período</h2>
                  </div>

                  <button className="btn btn-outline flex items-center">
                    <Download className="h-5 w-5 mr-2" />
                    Exportar
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <p className="text-gray-600 mb-1">Valor Total das Consultas</p>
                      <p className="text-3xl font-bold text-gray-700">
                        {formatCurrency(Number(report.total_consultations_value) || 0)}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="text-center">
                      <p className="text-gray-600 mb-1">Receita do Convênio</p>
                      <p className="text-3xl font-bold text-green-600">
                        {formatCurrency(Number(report.total_revenue) || 0)}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="text-center">
                      <p className="text-gray-600 mb-1">
                        Faturamento dos Profissionais
                      </p>
                      <p className="text-3xl font-bold text-blue-600">
                        {formatCurrency(
                          Number(calculateTotalProfessionalPayments()) || 0
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-600 text-center">
                  Período:{" "}
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
              </div>

              <div className="card">
                <h3 className="text-lg font-semibold mb-4">
                  Faturamento por Profissional
                </h3>

                {report.revenue_by_professional.length === 0 ? (
                  <div className="text-center py-4 bg-gray-50 rounded-lg">
                    <p className="text-gray-600">
                      Nenhum dado disponível para o período.
                    </p>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Profissional</th>
                          <th>Porcentagem</th>
                          <th>Consultas</th>
                          <th>Faturamento</th>
                          <th>Valor a Pagar</th>
                          <th>Valor a Receber</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.revenue_by_professional.map((item, index) => (
                          <tr key={index}>
                            <td>{item.professional_name}</td>
                            <td>
                              {Number(item.professional_percentage) || 0}%
                            </td>
                            <td>{Number(item.consultation_count) || 0}</td>
                            <td>{formatCurrency(Number(item.revenue) || 0)}</td>
                            <td>
                              {formatCurrency(
                                Number(item.professional_payment) || 0
                              )}
                            </td>
                            <td>
                              {formatCurrency(Number(item.clinic_revenue) || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card">
                <h3 className="text-lg font-semibold mb-4">
                  Faturamento por Serviço
                </h3>

                {report.revenue_by_service.length === 0 ? (
                  <div className="text-center py-4 bg-gray-50 rounded-lg">
                    <p className="text-gray-600">
                      Nenhum dado disponível para o período.
                    </p>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Serviço</th>
                          <th>Consultas</th>
                          <th>Faturamento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.revenue_by_service.map((item, index) => (
                          <tr key={index}>
                            <td>{item.service_name}</td>
                            <td>{Number(item.consultation_count) || 0}</td>
                            <td>{formatCurrency(Number(item.revenue) || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Clients by City Tab */}
      {activeTab === "clients" && (
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center">
              <MapPin className="h-6 w-6 text-red-600 mr-2" />
              <h2 className="text-xl font-semibold">Clientes por Cidade</h2>
            </div>

            <button
              onClick={fetchCityReports}
              className={`btn btn-primary ${
                isLoading ? "opacity-70 cursor-not-allowed" : ""
              }`}
              disabled={isLoading}
            >
              {isLoading ? "Carregando..." : "Atualizar"}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Carregando relatório...</p>
            </div>
          ) : clientsReport.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <MapPin className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhum dado disponível
              </h3>
              <p className="text-gray-600">
                Não há clientes cadastrados com informações de cidade.
              </p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-center">
                    <p className="text-blue-600 font-medium">
                      Total de Cidades
                    </p>
                    <p className="text-2xl font-bold text-blue-700">
                      {clientsReport.length}
                    </p>
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-center">
                    <p className="text-green-600 font-medium">
                      Clientes Ativos
                    </p>
                    <p className="text-2xl font-bold text-green-700">
                      {clientsReport.reduce(
                        (sum, city) => sum + (Number(city.active_clients) || 0),
                        0
                      )}
                    </p>
                  </div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-center">
                    <p className="text-yellow-600 font-medium">
                      Clientes Pendentes
                    </p>
                    <p className="text-2xl font-bold text-yellow-700">
                      {clientsReport.reduce(
                        (sum, city) =>
                          sum + (Number(city.pending_clients) || 0),
                        0
                      )}
                    </p>
                  </div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-center">
                    <p className="text-red-600 font-medium">
                      Clientes Vencidos
                    </p>
                    <p className="text-2xl font-bold text-red-700">
                      {clientsReport.reduce(
                        (sum, city) =>
                          sum + (Number(city.expired_clients) || 0),
                        0
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Cidade</th>
                      <th>Estado</th>
                      <th>Total de Clientes</th>
                      <th>Ativos</th>
                      <th>Pendentes</th>
                      <th>Vencidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientsReport.map((city, index) => (
                      <tr key={index}>
                        <td className="flex items-center">
                          <MapPin className="h-4 w-4 text-gray-500 mr-2" />
                          {city.city}
                        </td>
                        <td>{city.state}</td>
                        <td className="font-medium">{city.client_count}</td>
                        <td>
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                            {Number(city.active_clients) || 0}
                          </span>
                        </td>
                        <td>
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                            {Number(city.pending_clients) || 0}
                          </span>
                        </td>
                        <td>
                          <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                            {Number(city.expired_clients) || 0}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Professionals by City Tab */}
      {activeTab === "professionals" && (
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center">
              <Building className="h-6 w-6 text-red-600 mr-2" />
              <h2 className="text-xl font-semibold">
                Profissionais por Cidade
              </h2>
            </div>

            <button
              onClick={fetchCityReports}
              className={`btn btn-primary ${
                isLoading ? "opacity-70 cursor-not-allowed" : ""
              }`}
              disabled={isLoading}
            >
              {isLoading ? "Carregando..." : "Atualizar"}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Carregando relatório...</p>
            </div>
          ) : professionalsReport.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <Building className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhum dado disponível
              </h3>
              <p className="text-gray-600">
                Não há profissionais cadastrados com informações de cidade.
              </p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-center">
                    <p className="text-blue-600 font-medium">
                      Total de Cidades
                    </p>
                    <p className="text-2xl font-bold text-blue-700">
                      {professionalsReport.length}
                    </p>
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-center">
                    <p className="text-green-600 font-medium">
                      Total de Profissionais
                    </p>
                    <p className="text-2xl font-bold text-green-700">
                      {professionalsReport.reduce(
                        (sum, city) => sum + Number(city.total_professionals),
                        0
                      )}
                    </p>
                  </div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-center">
                    <p className="text-purple-600 font-medium">
                      Categorias Ativas
                    </p>
                    <p className="text-2xl font-bold text-purple-700">
                      {
                        [
                          ...new Set(
                            professionalsReport.flatMap((city) =>
                              city.categories.map((cat) => cat.category_name)
                            )
                          ),
                        ].length
                      }
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {professionalsReport.map((city, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <MapPin className="h-5 w-5 text-red-600 mr-2" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          {city.city}, {city.state}
                        </h3>
                      </div>
                      <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                        {city.total_professionals} profissionais
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {city.categories.map((category, catIndex) => (
                        <div
                          key={catIndex}
                          className="bg-white p-4 rounded-lg border border-gray-200"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              {category.category_name || "Sem categoria"}
                            </span>
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                              {category.count}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Agenda Financial Tab */}
      {activeTab === "agenda_financial" && (
        <>
          <div className="card mb-6">
            <div className="flex items-center mb-4">
              <Calendar className="h-6 w-6 text-red-600 mr-2" />
              <h2 className="text-xl font-semibold">Selecione o Período</h2>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchAgendaFinancialReport();
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <label
                    htmlFor="agendaStartDate"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Data Inicial
                  </label>
                  <input
                    id="agendaStartDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="agendaEndDate"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Data Final
                  </label>
                  <input
                    id="agendaEndDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="agendaPartner"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Parceiro
                  </label>
                  <select
                    id="agendaPartner"
                    value={selectedAgendaPartnerId}
                    onChange={(e) => setSelectedAgendaPartnerId(e.target.value)}
                    className="input"
                  >
                    <option value="">Todos (visão geral)</option>
                    {agendaPartners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.percentage != null ? ` (${p.percentage}%)` : ""}
                      </option>
                    ))}
                  </select>
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
            </form>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6">
              {error}
            </div>
          )}

          {agendaFinancialReport && (
            <div className="space-y-6">
              <div
                className={`grid grid-cols-1 gap-4 ${
                  agendaFinancialReport.partner?.is_partner
                    ? "md:grid-cols-3"
                    : "md:grid-cols-2"
                }`}
              >
                <div className="card">
                  <p className="text-gray-600 mb-1">Total Recebido (Agenda)</p>
                  <p className="text-3xl font-bold text-green-600">
                    {formatCurrency(
                      Number(agendaFinancialReport.summary.total_amount) || 0
                    )}
                  </p>
                </div>
                <div className="card">
                  <p className="text-gray-600 mb-1">Total de Pagamentos</p>
                  <p className="text-3xl font-bold text-blue-600">
                    {Number(agendaFinancialReport.summary.total_payments) || 0}
                  </p>
                </div>
                {agendaFinancialReport.partner?.is_partner && (
                  <div className="card">
                    <p className="text-gray-600 mb-1">
                      Comissão do parceiro
                      {agendaFinancialReport.partner.percentage != null
                        ? ` (${agendaFinancialReport.partner.percentage}%)`
                        : ""}
                    </p>
                    <p className="text-3xl font-bold text-red-600">
                      {formatCurrency(
                        Number(
                          agendaFinancialReport.partner.commission_amount
                        ) || 0
                      )}
                    </p>
                  </div>
                )}
              </div>

              <div className="card">
                <h3 className="text-lg font-semibold mb-4">
                  {agendaFinancialReport.partner?.is_partner
                    ? "Pagamentos que geraram comissão"
                    : "Pagamentos por Profissional"}
                </h3>

                {agendaFinancialReport.by_professional.length === 0 ? (
                  <div className="text-center py-4 bg-gray-50 rounded-lg">
                    <p className="text-gray-600">
                      Nenhum pagamento aprovado no período.
                    </p>
                  </div>
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
                        {agendaFinancialReport.by_professional.map((item) => (
                          <tr key={item.professional_id}>
                            <td>{item.professional_name}</td>
                            <td>{item.payments_count}</td>
                            <td>{formatCurrency(Number(item.total_amount) || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReportsPage;
