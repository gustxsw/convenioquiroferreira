import type React from "react";
import { useState, useEffect } from "react";
import { Shield, Plus, Trash2, X, Check, Info } from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";

type Insurance = { id: number; name: string; is_active?: boolean };

const InsurancesPage: React.FC = () => {
  const [insurances, setInsurances] = useState<Insurance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Create modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation state
  const [insuranceToDelete, setInsuranceToDelete] = useState<Insurance | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchInsurances();
  }, []);

  const fetchInsurances = async () => {
    try {
      setIsLoading(true);
      const response = await fetchWithAuth(
        `${getApiUrl()}/api/professional/insurances`
      );
      if (!response.ok) throw new Error("Falha ao carregar convênios");
      const data = await response.json();
      setInsurances(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching insurances:", error);
      setError("Não foi possível carregar os convênios");
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setNewName("");
    setError("");
    setSuccess("");
    setIsModalOpen(true);
  };

  const closeCreateModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setNewName("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetchWithAuth(
        `${getApiUrl()}/api/professional/insurances`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erro ao adicionar convênio");
      }

      const created: Insurance = await response.json();
      setInsurances((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      setSuccess("Convênio adicionado com sucesso!");
      setIsModalOpen(false);
      setNewName("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Erro ao adicionar convênio"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (insurance: Insurance) => {
    setError("");
    setSuccess("");
    setInsuranceToDelete(insurance);
  };

  const cancelDelete = () => {
    if (isDeleting) return;
    setInsuranceToDelete(null);
  };

  const deleteInsurance = async () => {
    if (!insuranceToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetchWithAuth(
        `${getApiUrl()}/api/professional/insurances/${insuranceToDelete.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Erro ao remover convênio");
      }

      setInsurances((prev) =>
        prev.filter((i) => i.id !== insuranceToDelete.id)
      );
      setSuccess("Convênio removido com sucesso!");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Erro ao remover convênio"
      );
    } finally {
      setIsDeleting(false);
      setInsuranceToDelete(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Convênios Aceitos
          </h1>
          <p className="text-gray-600">
            Gerencie os planos de saúde que você atende
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="btn btn-primary flex items-center"
        >
          <Plus className="h-5 w-5 mr-2" />
          Novo Convênio
        </button>
      </div>

      {/* Info note */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
          O assistente do WhatsApp usa esta lista para responder pacientes que
          perguntam sobre cobertura, e o agendamento exibe estas opções ao marcar
          uma consulta.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>
      )}

      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-6">
          {success}
        </div>
      )}

      {/* Content card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando convênios...</p>
          </div>
        ) : insurances.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nenhum convênio cadastrado
            </h3>
            <p className="text-gray-600 mb-4">
              Comece adicionando os planos de saúde que você atende.
            </p>
            <button
              onClick={openCreateModal}
              className="btn btn-primary inline-flex items-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Adicionar Primeiro Convênio
            </button>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="sm:hidden space-y-3 p-4">
              {insurances.map((ins) => (
                <div
                  key={ins.id}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
                >
                  <div className="flex items-center">
                    <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center mr-3">
                      <Shield className="h-5 w-5 text-red-600" />
                    </div>
                    <span className="text-sm font-semibold text-gray-900">
                      {ins.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => confirmDelete(ins)}
                    className="text-gray-400 hover:text-red-600 transition-colors p-2"
                    title="Remover"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Convênio
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {insurances.map((ins) => (
                    <tr key={ins.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                              <Shield className="h-5 w-5 text-red-600" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {ins.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => confirmDelete(ins)}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                          title="Remover"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Create modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold">Novo Convênio</h2>
              <button
                onClick={closeCreateModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do convênio *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input"
                  placeholder="Ex: Unimed, Bradesco Saúde, Amil…"
                  autoFocus
                  required
                />
              </div>

              <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="btn btn-secondary"
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex items-center"
                  disabled={isSaving || !newName.trim()}
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Adicionando...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {insuranceToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Confirmar Remoção</h2>

            <p className="mb-6">
              Tem certeza que deseja remover o convênio{" "}
              <strong>{insuranceToDelete.name}</strong>? Essa ação não pode ser
              desfeita.
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                className="btn btn-secondary flex items-center"
                disabled={isDeleting}
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </button>
              <button
                onClick={deleteInsurance}
                className="btn bg-red-600 text-white hover:bg-red-700 flex items-center"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Removendo...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Confirmar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InsurancesPage;
