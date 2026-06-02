import type React from "react";
import { useState, useEffect } from "react";
import {
  Search,
  X,
  Check,
  Percent,
  Users,
  Plus,
  Trash2,
} from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";

type Partner = {
  id: number;
  name: string;
  email: string | null;
  code: string | null;
  percentage: number | null;
  professionals_count: number;
};

type ProfessionalLite = {
  id: number;
  name: string;
  email: string | null;
  professional_type: string;
};

const ManageAgendaPartnersPage: React.FC = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Config modal (define %/código de um financeiro_agenda como parceiro)
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configUserId, setConfigUserId] = useState("");
  const [configPercentage, setConfigPercentage] = useState("");
  const [configCode, setConfigCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Professionals management modal
  const [isProfsOpen, setIsProfsOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [linked, setLinked] = useState<ProfessionalLite[]>([]);
  const [available, setAvailable] = useState<ProfessionalLite[]>([]);
  const [profSearch, setProfSearch] = useState("");
  const [isLoadingProfs, setIsLoadingProfs] = useState(false);

  useEffect(() => {
    fetchPartners();
  }, []);

  const fetchPartners = async () => {
    try {
      setIsLoading(true);
      setError("");
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}/api/admin/agenda-partners`);
      if (!response.ok) {
        throw new Error("Falha ao carregar parceiros");
      }
      const data = await response.json();
      setPartners(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar parceiros");
      setPartners([]);
    } finally {
      setIsLoading(false);
    }
  };

  const openConfigModal = (partner?: Partner) => {
    setConfigUserId(partner ? String(partner.id) : "");
    setConfigPercentage(partner?.percentage != null ? String(partner.percentage) : "");
    setConfigCode(partner?.code || "");
    setError("");
    setSuccess("");
    setIsConfigOpen(true);
  };

  const closeConfigModal = () => {
    setIsConfigOpen(false);
    setConfigUserId("");
    setConfigPercentage("");
    setConfigCode("");
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const userId = Number.parseInt(configUserId, 10);
    if (Number.isNaN(userId)) {
      setError("Informe o ID do usuário financeiro_agenda.");
      return;
    }

    try {
      setIsSaving(true);
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/agenda-partners/${userId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            is_partner: true,
            percentage: configPercentage === "" ? null : Number(configPercentage),
            code: configCode.trim() || null,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erro ao salvar parceiro");
      }

      await fetchPartners();
      setSuccess("Parceiro salvo com sucesso!");
      setTimeout(() => {
        closeConfigModal();
        setSuccess("");
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar parceiro");
    } finally {
      setIsSaving(false);
    }
  };

  const removePartner = async (partner: Partner) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/agenda-partners/${partner.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_partner: false }),
        }
      );
      if (!response.ok) {
        throw new Error("Erro ao remover parceiro");
      }
      await fetchPartners();
      setSuccess("Parceiro desmarcado com sucesso!");
      setTimeout(() => setSuccess(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover parceiro");
      setTimeout(() => setError(""), 3000);
    }
  };

  const openProfsModal = async (partner: Partner) => {
    setSelectedPartner(partner);
    setProfSearch("");
    setIsProfsOpen(true);
    await fetchPartnerProfessionals(partner.id);
  };

  const closeProfsModal = () => {
    setIsProfsOpen(false);
    setSelectedPartner(null);
    setLinked([]);
    setAvailable([]);
  };

  const fetchPartnerProfessionals = async (partnerId: number) => {
    try {
      setIsLoadingProfs(true);
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/agenda-partners/${partnerId}/professionals`
      );
      if (!response.ok) {
        throw new Error("Falha ao carregar profissionais");
      }
      const data = await response.json();
      setLinked(Array.isArray(data.linked) ? data.linked : []);
      setAvailable(Array.isArray(data.available) ? data.available : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar profissionais");
    } finally {
      setIsLoadingProfs(false);
    }
  };

  const assignProfessional = async (profId: number, partnerId: number | null) => {
    if (!selectedPartner) return;
    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/professionals/${profId}/agenda-partner`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partner_id: partnerId }),
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erro ao vincular profissional");
      }
      await fetchPartnerProfessionals(selectedPartner.id);
      await fetchPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao vincular profissional");
      setTimeout(() => setError(""), 3000);
    }
  };

  const filteredAvailable = available.filter(
    (p) =>
      !profSearch ||
      p.name.toLowerCase().includes(profSearch.toLowerCase()) ||
      p.email?.toLowerCase().includes(profSearch.toLowerCase())
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Parceiros da Agenda
          </h1>
          <p className="text-gray-600">
            Configure parceiros e vincule os profissionais sob responsabilidade
            de cada um.
          </p>
        </div>
        <button
          onClick={() => openConfigModal()}
          className="btn btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Configurar parceiro
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
        O usuário precisa ter o perfil <strong>financeiro_agenda</strong>{" "}
        (atribuído em "Usuários"). Aqui você define a porcentagem de parceria, o
        código de indicação e quais profissionais ele acompanha.
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>
      )}
      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-6">
          {success}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando parceiros...</p>
          </div>
        ) : partners.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhum parceiro configurado
            </h3>
            <p className="text-gray-600">
              Clique em "Configurar parceiro" para começar.
            </p>
          </div>
        ) : (
          <div className="hidden sm:block">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Parceiro
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Código
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Comissão
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Profissionais
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {partners.map((partner) => (
                  <tr key={partner.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center mr-3">
                          <Users className="h-5 w-5 text-red-600" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {partner.name}
                          </div>
                          {partner.email && (
                            <div className="text-sm text-gray-500">
                              {partner.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <code className="bg-gray-100 px-2 py-1 rounded">
                        {partner.code || "-"}
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {partner.percentage != null
                        ? `${partner.percentage}%`
                        : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {partner.professionals_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                      <button
                        onClick={() => openProfsModal(partner)}
                        className="text-blue-600 hover:text-blue-800 inline-flex items-center"
                      >
                        <Users className="h-4 w-4 mr-1" />
                        Profissionais
                      </button>
                      <button
                        onClick={() => openConfigModal(partner)}
                        className="text-gray-600 hover:text-gray-800 inline-flex items-center"
                      >
                        <Percent className="h-4 w-4 mr-1" />
                        Editar
                      </button>
                      <button
                        onClick={() => removePartner(partner)}
                        className="text-red-600 hover:text-red-800 inline-flex items-center"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Config modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center">
                <Users className="h-6 w-6 text-red-600 mr-2" />
                Configurar parceiro
              </h2>
              <button
                onClick={closeConfigModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={saveConfig} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID do usuário (perfil financeiro_agenda) *
                </label>
                <input
                  type="number"
                  value={configUserId}
                  onChange={(e) => setConfigUserId(e.target.value)}
                  className="input"
                  placeholder="Ex.: 123"
                  required
                  disabled={isSaving}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Você encontra o ID na tela "Usuários".
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Porcentagem de parceria (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={configPercentage}
                  onChange={(e) => setConfigPercentage(e.target.value)}
                  className="input"
                  placeholder="Ex.: 20"
                  disabled={isSaving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Código de indicação
                </label>
                <input
                  type="text"
                  value={configCode}
                  onChange={(e) => setConfigCode(e.target.value)}
                  className="input"
                  placeholder="Deixe em branco para gerar automaticamente"
                  disabled={isSaving}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Usado no cadastro do profissional para vínculo automático.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm">
                  {success}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={closeConfigModal}
                  className="btn btn-secondary"
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`btn btn-primary flex items-center ${
                    isSaving ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                  disabled={isSaving}
                >
                  <Check className="h-5 w-5 mr-2" />
                  {isSaving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Professionals modal */}
      {isProfsOpen && selectedPartner && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">Profissionais do parceiro</h2>
                <p className="text-sm text-gray-600">{selectedPartner.name}</p>
              </div>
              <button
                onClick={closeProfsModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Linked */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Vinculados ({linked.length})
                </h3>
                {isLoadingProfs ? (
                  <p className="text-gray-500 text-sm">Carregando...</p>
                ) : linked.length === 0 ? (
                  <p className="text-gray-500 text-sm">
                    Nenhum profissional vinculado.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {linked.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2"
                      >
                        <span className="text-sm text-gray-900">{p.name}</span>
                        <button
                          onClick={() => assignProfessional(p.id, null)}
                          className="text-red-600 hover:text-red-800 inline-flex items-center text-sm"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Available */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Disponíveis para vincular
                </h3>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={profSearch}
                    onChange={(e) => setProfSearch(e.target.value)}
                    placeholder="Buscar profissional..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
                  />
                </div>
                {isLoadingProfs ? (
                  <p className="text-gray-500 text-sm">Carregando...</p>
                ) : filteredAvailable.length === 0 ? (
                  <p className="text-gray-500 text-sm">
                    Nenhum profissional disponível.
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-72 overflow-y-auto">
                    {filteredAvailable.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2"
                      >
                        <span className="text-sm text-gray-900">{p.name}</span>
                        <button
                          onClick={() =>
                            assignProfessional(p.id, selectedPartner.id)
                          }
                          className="text-green-600 hover:text-green-800 inline-flex items-center text-sm"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Vincular
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button onClick={closeProfsModal} className="btn btn-secondary">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageAgendaPartnersPage;
