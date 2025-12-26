import React, { useState, useEffect } from "react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import { Users, Plus, DollarSign, CheckCircle, XCircle, Copy, Check } from "lucide-react";

interface Affiliate {
  id: number;
  name: string;
  code: string;
  status: string;
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
}

const ManageAffiliatesPage: React.FC = () => {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [selectedAffiliate, setSelectedAffiliate] = useState<Affiliate | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCommissionsModal, setShowCommissionsModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    cpf: "",
    email: "",
    password: "",
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
        setFormData({ name: "", cpf: "", email: "", password: "" });
        loadAffiliates();
      } else {
        const data = await response.json();
        setError(data.error || "Erro ao criar afiliado");
      }
    } catch (err) {
      setError("Erro ao criar afiliado");
    }
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

  const markAsPaid = async (commissionId: number) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/affiliates/${selectedAffiliate?.id}/commissions/${commissionId}/pay`,
        {
          method: "PUT",
        }
      );

      if (response.ok) {
        setSuccess("Comissão marcada como paga!");
        if (selectedAffiliate) {
          viewCommissions(selectedAffiliate);
        }
        loadAffiliates();
      } else {
        setError("Erro ao marcar como pago");
      }
    } catch (err) {
      setError("Erro ao marcar como pago");
    }
  };

  const copyAffiliateLink = (code: string) => {
    const link = `${window.location.origin}/register?affiliate=${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Gerenciar Afiliados</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          Novo Afiliado
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          {success}
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Código / Link
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Clientes
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
            {affiliates.map((affiliate) => (
              <tr key={affiliate.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {affiliate.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <div className="flex items-center space-x-2">
                    <span>{affiliate.code}</span>
                    <button
                      onClick={() => copyAffiliateLink(affiliate.code)}
                      className="text-blue-600 hover:text-blue-700 p-1 rounded hover:bg-blue-50"
                      title="Copiar link de cadastro"
                    >
                      {copiedCode === affiliate.code ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {affiliate.clients_count}
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
                <p className="mt-1 text-sm text-gray-500">
                  O código de afiliado será gerado automaticamente
                </p>
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
                      <td className="px-4 py-2">
                        {commission.status === "pending" && (
                          <button
                            onClick={() => markAsPaid(commission.id)}
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
    </div>
  );
};

export default ManageAffiliatesPage;
