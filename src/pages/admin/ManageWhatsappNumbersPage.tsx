import type React from "react";
import { useState, useEffect } from "react";
import {
  Smartphone,
  Plus,
  Trash2,
  Check,
  X,
  Bot,
  Pencil,
} from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";

type WhatsappNumber = {
  id: number;
  phone_number_id: string | null;
  display_number: string | null;
  professional_id: number | null;
  professional_name: string | null;
  professional_type: string | null;
  label: string | null;
  ai_enabled: boolean | null;
  daily_limit: number | null;
  is_active: boolean;
  ai_replies_today: number;
};

type ProfessionalLite = {
  id: number;
  name: string;
  professional_type: string | null;
};

// ai_enabled é tri-state: null = usa o padrão do ambiente (WHATSAPP_AI_MODE).
const aiEnabledToForm = (v: boolean | null): string =>
  v === true ? "true" : v === false ? "false" : "";

const emptyForm = {
  professional_id: "",
  phone_number_id: "",
  display_number: "",
  label: "",
  ai_enabled: "",
  daily_limit: "",
  is_active: true,
};

const ManageWhatsappNumbersPage: React.FC = () => {
  const [numbers, setNumbers] = useState<WhatsappNumber[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchNumbers();
    fetchProfessionals();
  }, []);

  const fetchNumbers = async () => {
    try {
      setIsLoading(true);
      setError("");
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}/api/admin/whatsapp/numbers`);
      if (!response.ok) throw new Error("Falha ao carregar números");
      const data = await response.json();
      setNumbers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar números");
      setNumbers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProfessionals = async () => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}/api/users`);
      if (!response.ok) return;
      const data = await response.json();
      const profs = (Array.isArray(data) ? data : [])
        .filter((u: any) => Array.isArray(u.roles) && u.roles.includes("professional"))
        .map((u: any) => ({
          id: u.id,
          name: u.name,
          professional_type: u.professional_type || "convenio",
        }))
        .sort((a: ProfessionalLite, b: ProfessionalLite) =>
          a.name.localeCompare(b.name, "pt-BR")
        );
      setProfessionals(profs);
    } catch {
      /* silencioso: o seletor apenas fica vazio */
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError("");
    setSuccess("");
    setIsModalOpen(true);
  };

  const openEdit = (n: WhatsappNumber) => {
    setEditingId(n.id);
    setForm({
      professional_id: n.professional_id != null ? String(n.professional_id) : "",
      phone_number_id: n.phone_number_id || "",
      display_number: n.display_number || "",
      label: n.label || "",
      ai_enabled: aiEnabledToForm(n.ai_enabled),
      daily_limit: n.daily_limit != null ? String(n.daily_limit) : "",
      is_active: n.is_active,
    });
    setError("");
    setSuccess("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  };

  const saveNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.professional_id) {
      setError("Selecione o profissional dono do número.");
      return;
    }
    if (!form.phone_number_id.trim() && !form.display_number.trim()) {
      setError("Informe o Phone Number ID (Meta) ou o número exibido.");
      return;
    }

    const payload = {
      professional_id: Number(form.professional_id),
      phone_number_id: form.phone_number_id.trim() || null,
      display_number: form.display_number.trim() || null,
      label: form.label.trim() || null,
      ai_enabled: form.ai_enabled === "" ? null : form.ai_enabled,
      daily_limit: form.daily_limit === "" ? null : Number(form.daily_limit),
      is_active: form.is_active,
    };

    try {
      setIsSaving(true);
      const apiUrl = getApiUrl();
      const url = editingId
        ? `${apiUrl}/api/admin/whatsapp/numbers/${editingId}`
        : `${apiUrl}/api/admin/whatsapp/numbers`;
      const response = await fetchWithAuth(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Erro ao salvar número");
      }
      await fetchNumbers();
      setSuccess(editingId ? "Número atualizado!" : "Número cadastrado!");
      setTimeout(() => {
        closeModal();
        setSuccess("");
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar número");
    } finally {
      setIsSaving(false);
    }
  };

  const removeNumber = async (n: WhatsappNumber) => {
    if (
      !window.confirm(
        `Remover o número de ${n.professional_name || "profissional"}? O bot deixará de atender por ele.`
      )
    ) {
      return;
    }
    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/whatsapp/numbers/${n.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Erro ao remover número");
      await fetchNumbers();
      setSuccess("Número removido.");
      setTimeout(() => setSuccess(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover número");
      setTimeout(() => setError(""), 3000);
    }
  };

  const aiBadge = (v: boolean | null) => {
    if (v === true)
      return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">IA ligada</span>;
    if (v === false)
      return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">IA desligada</span>;
    return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">Padrão</span>;
  };

  const typeBadge = (t: string | null) =>
    t === "agenda_only" ? (
      <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">Só agenda</span>
    ) : (
      <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">Convênio</span>
    );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Números da Secretária Virtual
          </h1>
          <p className="text-gray-600">
            Vincule cada número de WhatsApp ao profissional dono e controle a IA
            sem precisar de novo deploy.
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary flex items-center">
          <Plus className="h-5 w-5 mr-2" />
          Adicionar número
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-800">
        O <strong>Phone Number ID</strong> é o identificador do número na Meta
        Cloud API. O <strong>número exibido</strong> (só dígitos) serve de
        fallback. Em <strong>IA</strong>, "Padrão" segue a variável de ambiente;
        "ligada/desligada" força por este número. O tipo do profissional
        (Convênio / Só agenda) define se a IA pode oferecer o Convênio Quiro
        Ferreira — altere-o na tela de Usuários.
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
            <p className="text-gray-600">Carregando números...</p>
          </div>
        ) : numbers.length === 0 ? (
          <div className="text-center py-12">
            <Smartphone className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhum número cadastrado
            </h3>
            <p className="text-gray-600">
              Clique em "Adicionar número" para vincular o primeiro.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Profissional
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Número / ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IA
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uso hoje
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {numbers.map((n) => (
                  <tr key={n.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center mr-3">
                          <Smartphone className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {n.professional_name || (
                              <span className="text-red-600">Sem profissional</span>
                            )}
                          </div>
                          <div className="mt-0.5">{typeBadge(n.professional_type)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {n.label && (
                        <div className="text-gray-900 font-medium">{n.label}</div>
                      )}
                      {n.display_number && (
                        <div className="text-gray-600">{n.display_number}</div>
                      )}
                      {n.phone_number_id && (
                        <code className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">
                          {n.phone_number_id}
                        </code>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {aiBadge(n.ai_enabled)}
                      {n.daily_limit != null && (
                        <div className="text-xs text-gray-400 mt-1">
                          teto {n.daily_limit}/dia
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {n.ai_replies_today} respostas IA
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {n.is_active ? (
                        <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                          Ativo
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                      <button
                        onClick={() => openEdit(n)}
                        className="text-blue-600 hover:text-blue-800 inline-flex items-center"
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Editar
                      </button>
                      <button
                        onClick={() => removeNumber(n)}
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

      {/* Create/Edit modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center">
                <Bot className="h-6 w-6 text-green-600 mr-2" />
                {editingId ? "Editar número" : "Adicionar número"}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={saveNumber} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Profissional dono do número *
                </label>
                <select
                  value={form.professional_id}
                  onChange={(e) =>
                    setForm({ ...form, professional_id: e.target.value })
                  }
                  className="input"
                  required
                  disabled={isSaving}
                >
                  <option value="">Selecione um profissional...</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.professional_type === "agenda_only"
                        ? " (só agenda)"
                        : " (convênio)"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number ID (Meta)
                </label>
                <input
                  type="text"
                  value={form.phone_number_id}
                  onChange={(e) =>
                    setForm({ ...form, phone_number_id: e.target.value })
                  }
                  className="input"
                  placeholder="Ex.: 123456789012345"
                  disabled={isSaving}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Número exibido (fallback)
                </label>
                <input
                  type="text"
                  value={form.display_number}
                  onChange={(e) =>
                    setForm({ ...form, display_number: e.target.value })
                  }
                  className="input"
                  placeholder="Ex.: 5564981249199"
                  disabled={isSaving}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Só dígitos. Informe ao menos o Phone Number ID ou este número.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Apelido (opcional)
                </label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="input"
                  placeholder="Ex.: Consultório Goiânia"
                  disabled={isSaving}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Modo IA
                  </label>
                  <select
                    value={form.ai_enabled}
                    onChange={(e) =>
                      setForm({ ...form, ai_enabled: e.target.value })
                    }
                    className="input"
                    disabled={isSaving}
                  >
                    <option value="">Padrão (ambiente)</option>
                    <option value="true">Ligada</option>
                    <option value="false">Desligada</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teto diário de IA
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.daily_limit}
                    onChange={(e) =>
                      setForm({ ...form, daily_limit: e.target.value })
                    }
                    className="input"
                    placeholder="Padrão"
                    disabled={isSaving}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm({ ...form, is_active: e.target.checked })
                  }
                  className="h-4 w-4 text-green-600 border-gray-300 rounded"
                  disabled={isSaving}
                />
                Número ativo (o bot atende por ele)
              </label>

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
                  onClick={closeModal}
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
    </div>
  );
};

export default ManageWhatsappNumbersPage;
