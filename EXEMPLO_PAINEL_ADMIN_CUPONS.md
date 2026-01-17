# Exemplo de Painel Administrativo de Cupons

Este documento mostra exemplos de código para implementar um painel administrativo completo de gerenciamento de cupons no futuro.

## Backend - Rotas para Gerenciamento de Cupons

Adicione essas rotas no `server/index.js` após as rotas de validação de cupom:

```javascript
// ===== ADMIN ROUTES - COUPON MANAGEMENT =====

// Listar todos os cupons (apenas admin)
app.get(
  "/api/admin/coupons",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, code, discount_type, discount_value, is_active, description, created_at
         FROM coupons
         ORDER BY created_at DESC`
      );

      res.json({ coupons: result.rows });
    } catch (error) {
      console.error("❌ Error listing coupons:", error);
      res.status(500).json({ message: "Erro ao listar cupons" });
    }
  }
);

// Criar novo cupom (apenas admin)
app.post(
  "/api/admin/coupons",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { code, discount_type, discount_value, description } = req.body;

      // Validar campos obrigatórios
      if (!code || !discount_value) {
        return res.status(400).json({
          message: "Código e valor do desconto são obrigatórios",
        });
      }

      // Verificar se já existe cupom com esse código
      const existingCoupon = await pool.query(
        `SELECT id FROM coupons WHERE UPPER(code) = UPPER($1)`,
        [code]
      );

      if (existingCoupon.rows.length > 0) {
        return res.status(400).json({
          message: "Já existe um cupom com esse código",
        });
      }

      const result = await pool.query(
        `INSERT INTO coupons (code, discount_type, discount_value, description, is_active, created_by)
         VALUES ($1, $2, $3, $4, true, $5)
         RETURNING *`,
        [
          code.toUpperCase(),
          discount_type || "fixed",
          discount_value,
          description || null,
          req.user.id,
        ]
      );

      res.json({
        message: "Cupom criado com sucesso",
        coupon: result.rows[0],
      });
    } catch (error) {
      console.error("❌ Error creating coupon:", error);
      res.status(500).json({ message: "Erro ao criar cupom" });
    }
  }
);

// Ativar/Desativar cupom (apenas admin)
app.patch(
  "/api/admin/coupons/:id/toggle",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `UPDATE coupons
         SET is_active = NOT is_active
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Cupom não encontrado" });
      }

      const coupon = result.rows[0];
      const status = coupon.is_active ? "ativado" : "desativado";

      res.json({
        message: `Cupom ${status} com sucesso`,
        coupon: coupon,
      });
    } catch (error) {
      console.error("❌ Error toggling coupon:", error);
      res.status(500).json({ message: "Erro ao atualizar status do cupom" });
    }
  }
);

// Deletar cupom (apenas admin)
app.delete(
  "/api/admin/coupons/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Verificar se o cupom já foi usado
      const usageCheck = await pool.query(
        `SELECT COUNT(*) as count FROM coupon_usage WHERE coupon_id = $1`,
        [id]
      );

      if (parseInt(usageCheck.rows[0].count) > 0) {
        return res.status(400).json({
          message:
            "Não é possível deletar um cupom que já foi usado. Considere desativá-lo.",
        });
      }

      const result = await pool.query(
        `DELETE FROM coupons WHERE id = $1 RETURNING code`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Cupom não encontrado" });
      }

      res.json({ message: `Cupom ${result.rows[0].code} deletado com sucesso` });
    } catch (error) {
      console.error("❌ Error deleting coupon:", error);
      res.status(500).json({ message: "Erro ao deletar cupom" });
    }
  }
);

// Ver histórico de uso de cupons (apenas admin)
app.get(
  "/api/admin/coupons/usage-history",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
          cu.id,
          cu.used_at,
          cu.discount_applied,
          cu.payment_reference,
          c.code as coupon_code,
          u.name as user_name,
          u.cpf as user_cpf
         FROM coupon_usage cu
         JOIN coupons c ON cu.coupon_id = c.id
         JOIN users u ON cu.user_id = u.id
         ORDER BY cu.used_at DESC
         LIMIT 100`
      );

      res.json({ usage_history: result.rows });
    } catch (error) {
      console.error("❌ Error fetching coupon usage history:", error);
      res
        .status(500)
        .json({ message: "Erro ao buscar histórico de uso de cupons" });
    }
  }
);
```

## Frontend - Página de Gerenciamento de Cupons

Crie um novo arquivo: `src/pages/admin/ManageCouponsPage.tsx`

```typescript
import React, { useState, useEffect } from "react";
import { Tag, Plus, Trash2, Power, History } from "lucide-react";

const ManageCouponsPage: React.FC = () => {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newCoupon, setNewCoupon] = useState({
    code: "",
    discount_type: "fixed",
    discount_value: "",
    description: "",
  });

  const getApiUrl = () => {
    if (
      window.location.hostname === "cartaoquiroferreira.com.br" ||
      window.location.hostname === "www.cartaoquiroferreira.com.br"
    ) {
      return "https://www.cartaoquiroferreira.com.br";
    }
    return "http://localhost:3001";
  };

  const fetchCoupons = async () => {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/api/admin/coupons`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCoupons(data.coupons);
      }
    } catch (error) {
      console.error("Error fetching coupons:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleCreateCoupon = async () => {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/api/admin/coupons`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newCoupon),
      });

      if (response.ok) {
        setShowCreateModal(false);
        setNewCoupon({
          code: "",
          discount_type: "fixed",
          discount_value: "",
          description: "",
        });
        fetchCoupons();
      }
    } catch (error) {
      console.error("Error creating coupon:", error);
    }
  };

  const handleToggleCoupon = async (id: number) => {
    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const response = await fetch(
        `${apiUrl}/api/admin/coupons/${id}/toggle`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        fetchCoupons();
      }
    } catch (error) {
      console.error("Error toggling coupon:", error);
    }
  };

  const handleDeleteCoupon = async (id: number) => {
    if (!confirm("Tem certeza que deseja deletar este cupom?")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/api/admin/coupons/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        fetchCoupons();
      } else {
        const data = await response.json();
        alert(data.message);
      }
    } catch (error) {
      console.error("Error deleting coupon:", error);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center">
          <Tag className="h-8 w-8 text-red-600 mr-3" />
          <h1 className="text-3xl font-bold">Gerenciar Cupons</h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Criar Cupom
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : (
        <div className="card">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4">Código</th>
                <th className="text-left py-3 px-4">Tipo</th>
                <th className="text-left py-3 px-4">Valor</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Descrição</th>
                <th className="text-right py-3 px-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="border-b">
                  <td className="py-3 px-4 font-medium">{coupon.code}</td>
                  <td className="py-3 px-4">
                    {coupon.discount_type === "fixed" ? "Fixo" : "Percentual"}
                  </td>
                  <td className="py-3 px-4">
                    {coupon.discount_type === "fixed"
                      ? `R$ ${parseFloat(coupon.discount_value).toFixed(2)}`
                      : `${coupon.discount_value}%`}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-1 rounded text-sm ${
                        coupon.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {coupon.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {coupon.description || "-"}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleToggleCoupon(coupon.id)}
                        className="p-2 hover:bg-gray-100 rounded"
                        title={
                          coupon.is_active ? "Desativar cupom" : "Ativar cupom"
                        }
                      >
                        <Power className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCoupon(coupon.id)}
                        className="p-2 hover:bg-red-50 text-red-600 rounded"
                        title="Deletar cupom"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Criar Novo Cupom</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Código do Cupom
                </label>
                <input
                  type="text"
                  value={newCoupon.code}
                  onChange={(e) =>
                    setNewCoupon({
                      ...newCoupon,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Ex: DESCONTO10"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Tipo de Desconto
                </label>
                <select
                  value={newCoupon.discount_type}
                  onChange={(e) =>
                    setNewCoupon({ ...newCoupon, discount_type: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="fixed">Fixo (R$)</option>
                  <option value="percentage">Percentual (%)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Valor do Desconto
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newCoupon.discount_value}
                  onChange={(e) =>
                    setNewCoupon({ ...newCoupon, discount_value: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder={
                    newCoupon.discount_type === "fixed" ? "Ex: 60.00" : "Ex: 10"
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Descrição (opcional)
                </label>
                <textarea
                  value={newCoupon.description}
                  onChange={(e) =>
                    setNewCoupon({ ...newCoupon, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={3}
                  placeholder="Descrição do cupom"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateCoupon}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageCouponsPage;
```

## Adicionar Rota no App.tsx

No arquivo `src/App.tsx`, adicione a rota para a página de gerenciamento de cupons:

```typescript
import ManageCouponsPage from "./pages/admin/ManageCouponsPage";

// Dentro das rotas do admin:
<Route path="/admin/coupons" element={<ManageCouponsPage />} />
```

## Adicionar Link no Sidebar (Admin)

No componente `Sidebar.tsx`, adicione o link para gerenciar cupons no menu do admin:

```typescript
{role === "admin" && (
  <li>
    <Link
      to="/admin/coupons"
      className={`sidebar-link ${location.pathname === "/admin/coupons" ? "active" : ""}`}
    >
      <Tag className="h-5 w-5" />
      <span>Gerenciar Cupons</span>
    </Link>
  </li>
)}
```
