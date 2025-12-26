import React, { useState, useEffect } from "react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import { Ticket, Plus, Edit, Trash2, Power } from "lucide-react";

interface Coupon {
  id: number;
  code: string;
  coupon_type: string;
  discount_value: string;
  final_price: string;
  valid_from: string | null;
  valid_until: string | null;
  description: string;
  unlimited_use: boolean;
  is_active: boolean;
  created_at: string;
}

const ManageCouponsPage: React.FC = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formData, setFormData] = useState({
    code: "",
    coupon_type: "titular",
    discount_value: "",
    final_price: "",
    valid_from: "",
    valid_until: "",
    description: "",
    unlimited_use: false,
  });

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    try {
      setIsLoading(true);
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}/api/admin/coupons`);

      if (response.ok) {
        const data = await response.json();
        setCoupons(data);
      } else {
        setError("Erro ao carregar cupons");
      }
    } catch (err) {
      setError("Erro ao carregar cupons");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const apiUrl = getApiUrl();
      const url = editingCoupon
        ? `${apiUrl}/api/admin/coupons/${editingCoupon.id}`
        : `${apiUrl}/api/admin/coupons`;

      const response = await fetchWithAuth(url, {
        method: editingCoupon ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          is_active: editingCoupon ? editingCoupon.is_active : true,
        }),
      });

      if (response.ok) {
        setSuccess(
          editingCoupon
            ? "Cupom atualizado com sucesso!"
            : "Cupom criado com sucesso!"
        );
        setShowModal(false);
        resetForm();
        loadCoupons();
      } else {
        const data = await response.json();
        setError(data.error || "Erro ao salvar cupom");
      }
    } catch (err) {
      setError("Erro ao salvar cupom");
    }
  };

  const handleEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      coupon_type: coupon.coupon_type,
      discount_value: coupon.discount_value || "",
      final_price: coupon.final_price || "",
      valid_from: coupon.valid_from
        ? new Date(coupon.valid_from).toISOString().split("T")[0]
        : "",
      valid_until: coupon.valid_until
        ? new Date(coupon.valid_until).toISOString().split("T")[0]
        : "",
      description: coupon.description || "",
      unlimited_use: coupon.unlimited_use,
    });
    setShowModal(true);
  };

  const handleDelete = async (couponId: number) => {
    if (!confirm("Tem certeza que deseja excluir este cupom?")) return;

    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/coupons/${couponId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        setSuccess("Cupom excluído com sucesso!");
        loadCoupons();
      } else {
        setError("Erro ao excluir cupom");
      }
    } catch (err) {
      setError("Erro ao excluir cupom");
    }
  };

  const toggleStatus = async (couponId: number) => {
    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(
        `${apiUrl}/api/admin/coupons/${couponId}/toggle`,
        {
          method: "PUT",
        }
      );

      if (response.ok) {
        setSuccess("Status atualizado com sucesso!");
        loadCoupons();
      } else {
        setError("Erro ao atualizar status");
      }
    } catch (err) {
      setError("Erro ao atualizar status");
    }
  };

  const resetForm = () => {
    setFormData({
      code: "",
      coupon_type: "titular",
      discount_value: "",
      final_price: "",
      valid_from: "",
      valid_until: "",
      description: "",
      unlimited_use: false,
    });
    setEditingCoupon(null);
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
        <h1 className="text-3xl font-bold text-gray-900">Gerenciar Cupons</h1>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          Novo Cupom
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
                Código
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Valor Final
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Validade
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
            {coupons.map((coupon) => (
              <tr key={coupon.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {coupon.code}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {coupon.coupon_type === "titular" ? "Cliente" : "Dependente"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {coupon.final_price
                    ? `R$ ${Number.parseFloat(coupon.final_price).toFixed(2)}`
                    : "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {coupon.valid_from && coupon.valid_until
                    ? `${new Date(coupon.valid_from).toLocaleDateString(
                        "pt-BR"
                      )} - ${new Date(coupon.valid_until).toLocaleDateString(
                        "pt-BR"
                      )}`
                    : "Sem limite"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      coupon.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {coupon.is_active ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                  <button
                    onClick={() => handleEdit(coupon)}
                    className="text-blue-600 hover:text-blue-700"
                    title="Editar"
                  >
                    <Edit className="w-4 h-4 inline" />
                  </button>
                  <button
                    onClick={() => toggleStatus(coupon.id)}
                    className="text-yellow-600 hover:text-yellow-700"
                    title={coupon.is_active ? "Desativar" : "Ativar"}
                  >
                    <Power className="w-4 h-4 inline" />
                  </button>
                  <button
                    onClick={() => handleDelete(coupon.id)}
                    className="text-red-600 hover:text-red-700"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4 inline" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingCoupon ? "Editar Cupom" : "Criar Novo Cupom"}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Código do Cupom
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value.toUpperCase() })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo
                  </label>
                  <select
                    value={formData.coupon_type}
                    onChange={(e) =>
                      setFormData({ ...formData, coupon_type: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  >
                    <option value="titular">Cliente</option>
                    <option value="dependente">Dependente</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valor Final (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.final_price}
                    onChange={(e) =>
                      setFormData({ ...formData, final_price: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Valor que o cliente pagará ao usar o cupom
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Desconto (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.discount_value}
                    onChange={(e) =>
                      setFormData({ ...formData, discount_value: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Válido de
                  </label>
                  <input
                    type="date"
                    value={formData.valid_from}
                    onChange={(e) =>
                      setFormData({ ...formData, valid_from: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Válido até
                  </label>
                  <input
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) =>
                      setFormData({ ...formData, valid_until: e.target.value })
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={3}
                />
              </div>

              <div className="mb-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.unlimited_use}
                    onChange={(e) =>
                      setFormData({ ...formData, unlimited_use: e.target.checked })
                    }
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Uso ilimitado</span>
                </label>
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  {editingCoupon ? "Atualizar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageCouponsPage;
