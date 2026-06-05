import type React from "react";
import { useEffect, useState } from "react";
import { fetchWithAuth, getApiUrl } from "../utils/apiHelpers";
import { X, Plus, Edit, Trash2, Calendar, Check } from "lucide-react";

type Evolution = {
  id: number;
  medical_record_id: number;
  evolution_date: string;
  content: string;
  created_at: string;
  updated_at: string;
};

type EvolutionsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  recordId: number;
  patientName: string | null;
  /** Chamado após criar/excluir para o pai atualizar o contador. */
  onChanged?: () => void;
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Converte um timestamp do servidor para o formato do input datetime-local (hora local).
const toDatetimeLocal = (value: string) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

const nowDatetimeLocal = () => toDatetimeLocal(new Date().toISOString());

const EvolutionsModal: React.FC<EvolutionsModalProps> = ({
  isOpen,
  onClose,
  recordId,
  patientName,
  onChanged,
}) => {
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Formulário de criação
  const [newContent, setNewContent] = useState("");
  const [newDate, setNewDate] = useState(nowDatetimeLocal());
  const [isSaving, setIsSaving] = useState(false);

  // Edição inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editDate, setEditDate] = useState("");

  const loadEvolutions = async () => {
    setIsLoading(true);
    setError("");
    try {
      const apiUrl = getApiUrl();
      const res = await fetchWithAuth(
        `${apiUrl}/api/medical-records/${recordId}/evolutions`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Erro ao carregar evoluções");
      }
      setEvolutions(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar evoluções");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setNewContent("");
      setNewDate(nowDatetimeLocal());
      setEditingId(null);
      loadEvolutions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, recordId]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!newContent.trim()) {
      setError("Conteúdo da evolução é obrigatório");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const apiUrl = getApiUrl();
      const res = await fetchWithAuth(
        `${apiUrl}/api/medical-records/${recordId}/evolutions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: newContent.trim(),
            evolution_date: newDate || undefined,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Erro ao registrar evolução");
      }
      setNewContent("");
      setNewDate(nowDatetimeLocal());
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar evolução");
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (evo: Evolution) => {
    setEditingId(evo.id);
    setEditContent(evo.content);
    setEditDate(toDatetimeLocal(evo.evolution_date));
    setError("");
  };

  const handleUpdate = async (id: number) => {
    if (!editContent.trim()) {
      setError("Conteúdo da evolução é obrigatório");
      return;
    }
    setError("");
    try {
      const apiUrl = getApiUrl();
      const res = await fetchWithAuth(
        `${apiUrl}/api/medical-records/evolutions/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: editContent.trim(),
            evolution_date: editDate || undefined,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Erro ao atualizar evolução");
      }
      setEditingId(null);
      await loadEvolutions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar evolução");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Excluir esta evolução?")) return;
    setError("");
    try {
      const apiUrl = getApiUrl();
      const res = await fetchWithAuth(
        `${apiUrl}/api/medical-records/evolutions/${id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Erro ao excluir evolução");
      }
      await loadEvolutions();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir evolução");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Evoluções do paciente</h2>
            {patientName && (
              <p className="text-sm text-gray-500 mt-0.5">{patientName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {error}
            </div>
          )}

          {/* Nova evolução */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Nova evolução</h3>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Data e hora</label>
              <input
                type="datetime-local"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Evolução</label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
                placeholder="Descreva a evolução da sessão..."
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleCreate}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-md px-4 py-2"
              >
                <Plus className="h-4 w-4" />
                {isSaving ? "Salvando..." : "Adicionar"}
              </button>
            </div>
          </div>

          {/* Lista de evoluções */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Histórico ({evolutions.length})
            </h3>
            {isLoading ? (
              <p className="text-sm text-gray-500">Carregando...</p>
            ) : evolutions.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma evolução registrada ainda.</p>
            ) : (
              <ul className="space-y-3">
                {evolutions.map((evo) => (
                  <li
                    key={evo.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    {editingId === evo.id ? (
                      <div className="space-y-2">
                        <input
                          type="datetime-local"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={4}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleUpdate(evo.id)}
                            className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md px-3 py-1.5"
                          >
                            <Check className="h-4 w-4" />
                            Salvar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center text-xs text-gray-500">
                            <Calendar className="h-3 w-3 mr-1" />
                            {formatDateTime(evo.evolution_date)}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEdit(evo)}
                              className="text-blue-600 hover:text-blue-900"
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(evo.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-900 whitespace-pre-wrap">
                          {evo.content}
                        </p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvolutionsModal;
