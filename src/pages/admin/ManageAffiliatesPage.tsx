import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import { Users, Plus, DollarSign, CheckCircle, XCircle, Copy, Check, UserPlus, Search, FileText } from "lucide-react";

interface Affiliate {
  id: number;
  name: string;
  code: string;
  status: string;
  commission_amount: string;
  pix_key?: string | null;
  clients_count: number;
  pending_total: string;
  paid_total: string;
  created_at: string;
}

interface Commission {
  id: number;
  client_name: string;
  client_cpf: string;
  amount: string;
  status: string;
  created_at: string;
  paid_at?: string | null;
  paid_by_name?: string | null;
  paid_method?: string | null;
  paid_receipt_url?: string | null;
  payment_reference?: string | null;
  mp_payment_id?: string | null;
}

interface ExistingUser {
  id: number;
  name: string;
  cpf: string;
  email: string | null;
  roles: string[];
}

const ManageAffiliatesPage: React.FC = () => {
  const navigate = useNavigate();
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [selectedAffiliate, setSelectedAffiliate] = useState<Affiliate | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCommissionsModal, setShowCommissionsModal] = useState(false);
  const [showEditCommissionModal, setShowEditCommissionModal] = useState(false);
  const [showEditPixModal, setShowEditPixModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [editingAffiliate, setEditingAffiliate] = useState<Affiliate | null>(null);
  const [editingPixAffiliate, setEditingPixAffiliate] = useState<Affiliate | null>(null);
  const [payingCommission, setPayingCommission] = useState<Commission | null>(null);
  const [newCommissionAmount, setNewCommissionAmount] = useState("");
  const [newPixKey, setNewPixKey] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReceipt, setPaymentReceipt] = useState<File | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [affiliateSearch, setAffiliateSearch] = useState("");
  const [searchCpf, setSearchCpf] = useState("");
  const [searchedUser, setSearchedUser] = useState<ExistingUser | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    cpf: "",
    email: "",
    password: "",
    commission_amount: "10.00",
    pix_key: "",
  });

  useEffect(() => {
    loadAffiliates();
  }, []);

  const loadAffiliates = async () => {
    try {
      setIsLoading(true);
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}/api/admin/affiliates`);

      if (response.ok) {
        const data = await response.json();
        setAffiliates(data);
      } else {
        setError("Erro ao carregar afiliados");
      }
    } catch (err) {
      setError("Erro ao carregar afiliados");
    } finally {
      setIsLoading(false);
    }
  };

  const searchUser = async () => {
    if (!searchCpf) return;

    try {
      setIsSearching(true);
      setError("");
      setSearchedUser(null);

      const apiUrl = getApiUrl();
      const cleanCpf = searchCpf.replace(/\D/g, "");
      const response = await fetchWithAuth(`${apiUrl}/api/admin/users/search?cpf=${cleanCpf}`);

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          if (data.user.roles.includes("vendedor")) {
            setError("Este usuário já é um vendedor");
          } else {
            setSearchedUser(data.user);
          }
        } else {
          setError("Usuário não encontrado");
        }
      } else {
        setError("Erro ao buscar usuário");
      }
    } catch (err) {
      setError("Erro ao buscar usuário");
    } finally {
      setIsSearching(false);
    }
  };

  const handleImportUser = async () => {
    if (!searchedUser) return;

    try {
      setError("");
      setSuccess("");

      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}/api/admin/affiliates/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: searchedUser.id }),
      });

      if (response.ok) {
        setSuccess("Usuário importado como vendedor com sucesso!");
        setShowImportModal(false);
        setSearchCpf("");
        setSearchedUser(null);
        loadAffiliates();
      } else {
        const data = await response.json();
        setError(data.error || "Erro ao importar usuário");
      }
    } catch (err) {
      setError("Erro ao importar usuário");
    }
  };

  const handleCreateAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}/api/admin/affiliates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSuccess("Afiliado criado com sucesso! O afiliado pode fazer login com o CPF e senha cadastrados.");
        setShowCreateModal(false);
        setFormData({
          name: "",
          cpf: "",
          email: "",
          password: "",
          commission_amount: "10.00",
          pix_key: "",
        });
        loadAffiliates();
      } else {
        const data = await response.json();
        setError(data.error || "Erro ao criar afiliado");
      }
    } catch (err) {
      setError("Erro ao criar afiliado");
    }
  };

  const openImportFromCreate = () => {
    setShowCreateModal(false);
    setShowImportModal(true);
    setSearchCpf(formData.cpf);
    setError("");
  };

  const toggleStatus = async (affiliateId: number, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/affiliates/${affiliateId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (response.ok) {
        setSuccess("Status atualizado com sucesso!");
        loadAffiliates();
      } else {
        setError("Erro ao atualizar status");
      }
    } catch (err) {
      setError("Erro ao atualizar status");
    }
  };

  const openEditCommissionModal = (affiliate: Affiliate) => {
    setEditingAffiliate(affiliate);
    setNewCommissionAmount(affiliate.commission_amount);
    setShowEditCommissionModal(true);
  };

  const openEditPixModal = (affiliate: Affiliate) => {
    setEditingPixAffiliate(affiliate);
    setNewPixKey(affiliate.pix_key || "");
    setShowEditPixModal(true);
  };

  const handleUpdateCommission = async () => {
    if (!editingAffiliate) return;

    try {
      setError("");
      setSuccess("");

      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/affiliates/${editingAffiliate.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commission_amount: newCommissionAmount }),
        }
      );

      if (response.ok) {
        setSuccess("Comissão atualizada com sucesso!");
        setShowEditCommissionModal(false);
        setEditingAffiliate(null);
        setNewCommissionAmount("");
        loadAffiliates();
      } else {
        const data = await response.json();
        setError(data.error || "Erro ao atualizar comissão");
      }
    } catch (err) {
      setError("Erro ao atualizar comissão");
    }
  };

  const handleUpdatePixKey = async () => {
    if (!editingPixAffiliate) return;

    try {
      setError("");
      setSuccess("");

      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/affiliates/${editingPixAffiliate.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pix_key: newPixKey }),
        }
      );

      if (response.ok) {
        setSuccess("Chave Pix atualizada com sucesso!");
        setShowEditPixModal(false);
        setEditingPixAffiliate(null);
        setNewPixKey("");
        loadAffiliates();
      } else {
        const data = await response.json();
        setError(data.error || "Erro ao atualizar chave Pix");
      }
    } catch (err) {
      setError("Erro ao atualizar chave Pix");
    }
  };

  const viewCommissions = async (affiliate: Affiliate) => {
    try {
      setSelectedAffiliate(affiliate);
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/affiliates/${affiliate.id}/commissions`
      );

      if (response.ok) {
        const data = await response.json();
        setCommissions(data);
        setShowCommissionsModal(true);
      } else {
        setError("Erro ao carregar comissões");
      }
    } catch (err) {
      setError("Erro ao carregar comissões");
    }
  };

  const openPayModal = (commission: Commission) => {
    setPayingCommission(commission);
    setPaymentMethod("");
    setPaymentReceipt(null);
    setShowPayModal(true);
  };

  const closePayModal = () => {
    setShowPayModal(false);
    setPayingCommission(null);
    setPaymentMethod("");
    setPaymentReceipt(null);
  };

  const markAsPaid = async () => {
    if (!selectedAffiliate || !payingCommission) return;

    try {
      setIsPaying(true);
      setError("");
      setSuccess("");
      const apiUrl = getApiUrl();
      const formData = new FormData();

      if (paymentMethod.trim()) {
        formData.append("paid_method", paymentMethod.trim());
      }

      if (paymentReceipt) {
        formData.append("receipt", paymentReceipt);
      }

      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/affiliates/${selectedAffiliate.id}/commissions/${payingCommission.id}/pay`,
        { method: "PUT", body: formData }
      );

      if (response.ok) {
        setSuccess("Comissão marcada como paga!");
        viewCommissions(selectedAffiliate);
        loadAffiliates();
        closePayModal();
      } else {
        const data = await response.json();
        setError(data.error || "Erro ao marcar como pago");
      }
    } catch (err) {
      setError("Erro ao marcar como pago");
    } finally {
      setIsPaying(false);
    }
  };

  const copyAffiliateLink = (affiliateId: number, code: string) => {
    const link = `${window.location.origin}/register?ref=${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const filteredAffiliates = affiliates.filter((affiliate) => {
    const term = affiliateSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      affiliate.name.toLowerCase().includes(term) ||
      affiliate.code.toLowerCase().includes(term)
    );
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gerenciar Afiliados</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => navigate("/admin/affiliates/financial-report")}
            className="flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <FileText className="w-5 h-5 mr-2" />
            Relatório Financeiro
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Importar Usuário
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <Plus className="w-5 h-5 mr-2" />
            Novo Afiliado
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          {success}
        </div>
      )}

      <div className="mb-4">
        <input
          type="text"
          value={affiliateSearch}
          onChange={(e) => setAffiliateSearch(e.target.value)}
          placeholder="Buscar afiliado por nome ou código"
          className="w-full sm:w-80 px-3 py-2 border rounded-lg text-sm"
        />
      </div>

      {/* Mobile View - Cards */}
      <div className="block lg:hidden space-y-4">
        {filteredAffiliates.map((affiliate) => (
          <div key={affiliate.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">{affiliate.name}</h3>
                <span
                  className={`inline-block mt-1 px-2 py-1 text-xs rounded-full ${
                    affiliate.status === "active"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {affiliate.status === "active" ? "Ativo" : "Inativo"}
                </span>
              </div>
              <button
                onClick={() => copyAffiliateLink(affiliate.id, affiliate.code)}
                className="text-blue-600 hover:text-blue-700 p-2 rounded hover:bg-blue-50"
                title="Copiar link"
              >
                {copiedCode === affiliate.code ? (
                  <Check className="w-5 h-5 text-green-600" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs">Clientes</p>
                <p className="font-semibold">{affiliate.clients_count}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Pendente</p>
                <p className="font-semibold text-yellow-600">
                  R$ {Number.parseFloat(affiliate.pending_total).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Pago</p>
                <p className="font-semibold text-green-600">
                  R$ {Number.parseFloat(affiliate.paid_total).toFixed(2)}
                </p>
              </div>
            </div>

            <button
              onClick={() => openEditPixModal(affiliate)}
              className="text-xs text-purple-600 hover:text-purple-700 underline mb-3"
            >
              Editar chave Pix
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => viewCommissions(affiliate)}
                className="flex-1 px-3 py-2 text-sm text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50"
              >
                Ver Comissões
              </button>
              <button
                onClick={() => toggleStatus(affiliate.id, affiliate.status)}
                className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {affiliate.status === "active" ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop View - Table */}
      <div className="hidden lg:block bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Link
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Clientes
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Comissão
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Total Pendente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Total Pago
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAffiliates.map((affiliate) => (
              <tr key={affiliate.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {affiliate.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => copyAffiliateLink(affiliate.id, affiliate.code)}
                    className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
                    title="Copiar link de cadastro"
                  >
                    {copiedCode === affiliate.code ? (
                      <>
                        <Check className="w-4 h-4 text-green-600" />
                        <span className="text-green-600">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copiar Link</span>
                      </>
                    )}
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {affiliate.clients_count}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-green-600">
                      R$ {Number.parseFloat(affiliate.commission_amount).toFixed(2)}
                    </span>
                    <button
                      onClick={() => openEditCommissionModal(affiliate)}
                      className="text-blue-600 hover:text-blue-700 text-xs underline"
                      title="Editar comissão"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => openEditPixModal(affiliate)}
                      className="text-purple-600 hover:text-purple-700 text-xs underline"
                      title="Editar chave Pix"
                    >
                      Pix
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  R$ {Number.parseFloat(affiliate.pending_total).toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  R$ {Number.parseFloat(affiliate.paid_total).toFixed(2)}
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
                <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                  <button
                    onClick={() => viewCommissions(affiliate)}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    Ver Comissões
                  </button>
                  <button
                    onClick={() => toggleStatus(affiliate.id, affiliate.status)}
                    className="text-gray-600 hover:text-gray-700"
                  >
                    {affiliate.status === "active" ? "Desativar" : "Ativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-2">Criar Novo Afiliado</h2>
            <p className="text-sm text-gray-600 mb-4">
              Preencha os dados abaixo. O afiliado usará o CPF e senha para fazer login no sistema.
            </p>
            <form onSubmit={handleCreateAffiliate}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do Afiliado
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                  placeholder="Ex: João Silva"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CPF (para login)
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    const formatted = value
                      .replace(/(\d{3})(\d)/, "$1.$2")
                      .replace(/(\d{3})(\d)/, "$1.$2")
                      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
                    setFormData({ ...formData, cpf: formatted });
                  }}
                  maxLength={14}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                  placeholder="000.000.000-00"
                />
              </div>
              {error.includes("CPF já cadastrado") && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  Este CPF já está cadastrado. Você pode importar o usuário existente como afiliado.
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={openImportFromCreate}
                      className="text-blue-600 hover:text-blue-700 underline"
                    >
                      Importar usuário
                    </button>
                  </div>
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (opcional)
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                  placeholder="Senha de acesso"
                  minLength={6}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor da Comissão (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.commission_amount}
                  onChange={(e) =>
                    setFormData({ ...formData, commission_amount: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                  placeholder="10.00"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Valor que o afiliado receberá por cada venda concluída
                </p>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chave Pix
                </label>
                <input
                  type="text"
                  value={formData.pix_key}
                  onChange={(e) =>
                    setFormData({ ...formData, pix_key: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Informe a chave Pix do afiliado"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Importar Usuário Existente</h2>
            <p className="text-sm text-gray-600 mb-4">
              Busque um usuário pelo CPF para torná-lo vendedor
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CPF do Usuário
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchCpf}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    const formatted = value
                      .replace(/(\d{3})(\d)/, "$1.$2")
                      .replace(/(\d{3})(\d)/, "$1.$2")
                      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
                    setSearchCpf(formatted);
                  }}
                  maxLength={14}
                  className="flex-1 px-3 py-2 border rounded-lg"
                  placeholder="000.000.000-00"
                />
                <button
                  onClick={searchUser}
                  disabled={isSearching || !searchCpf}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Search className="w-5 h-5" />
                </button>
              </div>
            </div>

            {searchedUser && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-2">Usuário Encontrado</h3>
                <p className="text-sm text-green-800"><strong>Nome:</strong> {searchedUser.name}</p>
                <p className="text-sm text-green-800"><strong>CPF:</strong> {searchedUser.cpf}</p>
                <p className="text-sm text-green-800"><strong>Email:</strong> {searchedUser.email || "Não informado"}</p>
                <p className="text-sm text-green-800"><strong>Roles:</strong> {searchedUser.roles.join(", ")}</p>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setSearchCpf("");
                  setSearchedUser(null);
                  setError("");
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancelar
              </button>
              {searchedUser && (
                <button
                  onClick={handleImportUser}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Importar como Vendedor
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showCommissionsModal && selectedAffiliate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                Comissões - {selectedAffiliate.name}
              </h2>
              <button
                onClick={() => setShowCommissionsModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {commissions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Nenhuma comissão registrada
              </p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Cliente
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      CPF
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Valor
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Data
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Origem
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Pago em
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Pago por
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Método
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Comprovante
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {commissions.map((commission) => (
                    <tr key={commission.id}>
                      <td className="px-4 py-2 text-sm">{commission.client_name}</td>
                      <td className="px-4 py-2 text-sm">{commission.client_cpf}</td>
                      <td className="px-4 py-2 text-sm">
                        R$ {Number.parseFloat(commission.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-2">
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
                      <td className="px-4 py-2 text-sm">
                        {new Date(commission.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600">
                        {commission.payment_reference || commission.mp_payment_id || "-"}
                      </td>
                      <td className="px-4 py-2">
                        {commission.paid_at
                          ? new Date(commission.paid_at).toLocaleDateString("pt-BR")
                          : "-"}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {commission.paid_by_name || "-"}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {commission.paid_method || "-"}
                      </td>
                      <td className="px-4 py-2 text-sm">
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
                      <td className="px-4 py-2">
                        {commission.status === "pending" && (
                          <button
                            onClick={() => openPayModal(commission)}
                            className="text-green-600 hover:text-green-700 text-sm"
                          >
                            Marcar como Pago
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {showPayModal && payingCommission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Confirmar Pagamento</h2>
            <div className="mb-4 text-sm text-gray-600">
              Comissão de <span className="font-semibold">{payingCommission.client_name}</span> - R${" "}
              {Number.parseFloat(payingCommission.amount).toFixed(2)}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Método de Pagamento
              </label>
              <input
                type="text"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Ex: Pix, transferência, dinheiro"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Comprovante (opcional)
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setPaymentReceipt(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Aceita imagem ou PDF
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={closePayModal}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                disabled={isPaying}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={markAsPaid}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                disabled={isPaying || !paymentMethod.trim()}
              >
                {isPaying ? "Salvando..." : "Confirmar Pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditCommissionModal && editingAffiliate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Editar Comissão</h2>
            <p className="text-sm text-gray-600 mb-4">
              Afiliado: <span className="font-semibold">{editingAffiliate.name}</span>
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Novo Valor da Comissão (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newCommissionAmount}
                onChange={(e) => setNewCommissionAmount(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                required
                placeholder="0.00"
              />
              <p className="mt-2 text-sm text-gray-500">
                Valor atual: R$ {Number.parseFloat(editingAffiliate.commission_amount).toFixed(2)}
              </p>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setShowEditCommissionModal(false);
                  setEditingAffiliate(null);
                  setNewCommissionAmount("");
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpdateCommission}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Atualizar
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditPixModal && editingPixAffiliate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Editar Chave Pix</h2>
            <p className="text-sm text-gray-600 mb-4">
              Afiliado: <span className="font-semibold">{editingPixAffiliate.name}</span>
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Chave Pix
              </label>
              <input
                type="text"
                value={newPixKey}
                onChange={(e) => setNewPixKey(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Informe a chave Pix"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setShowEditPixModal(false);
                  setEditingPixAffiliate(null);
                  setNewPixKey("");
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUpdatePixKey}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Atualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageAffiliatesPage;
