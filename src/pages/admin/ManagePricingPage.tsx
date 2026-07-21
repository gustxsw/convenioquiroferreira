import type React from "react";
import { useState, useEffect } from "react";
import { DollarSign, Save, AlertTriangle } from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";

type PricingMeta = {
  value: string;
  updated_at: string | null;
  updated_by_name: string | null;
} | null;

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ManagePricingPage: React.FC = () => {
  const [holder, setHolder] = useState("");
  const [dependent, setDependent] = useState("");
  const [holderMeta, setHolderMeta] = useState<PricingMeta>(null);
  const [dependentMeta, setDependentMeta] = useState<PricingMeta>(null);
  // Valores atualmente em vigor — a comparação com o formulário mostra o que muda.
  const [current, setCurrent] = useState<{ holder: number; dependent: number } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      setIsLoading(true);
      setError("");
      const response = await fetchWithAuth(`${getApiUrl()}/api/admin/pricing`);
      if (!response.ok) throw new Error("Falha ao carregar os valores");
      const data = await response.json();
      setCurrent({ holder: data.holder, dependent: data.dependent });
      setHolder(String(data.holder));
      setDependent(String(data.dependent));
      setHolderMeta(data.holder_meta);
      setDependentMeta(data.dependent_meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar valores");
    } finally {
      setIsLoading(false);
    }
  };

  const parsed = (v: string) => Number(v.replace(",", "."));
  const holderChanged = current != null && parsed(holder) !== current.holder;
  const dependentChanged = current != null && parsed(dependent) !== current.dependent;
  const hasChanges = holderChanged || dependentChanged;

  const handleSave = async () => {
    const h = parsed(holder);
    const d = parsed(dependent);
    if (!Number.isFinite(h) || h < 0 || !Number.isFinite(d) || d < 0) {
      setError("Informe valores numéricos válidos.");
      return;
    }
    if (
      !window.confirm(
        `Confirmar a mudança?\n\n` +
          `Titular: ${formatBRL(current!.holder)} → ${formatBRL(h)}\n` +
          `Dependente: ${formatBRL(current!.dependent)} → ${formatBRL(d)}\n\n` +
          `Passa a valer imediatamente na contratação e no que a Secretária Virtual informa aos pacientes.`
      )
    ) {
      return;
    }

    try {
      setIsSaving(true);
      setError("");
      const response = await fetchWithAuth(`${getApiUrl()}/api/admin/pricing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holder: h, dependent: d }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Erro ao salvar");
      setSuccess("Valores atualizados. Já valem para novas contratações.");
      setTimeout(() => setSuccess(""), 4000);
      await fetchPricing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar valores");
    } finally {
      setIsSaving(false);
    }
  };

  const metaLine = (meta: PricingMeta) => {
    if (!meta?.updated_at) return null;
    const when = new Date(meta.updated_at).toLocaleString("pt-BR");
    return (
      <p className="mt-1 text-xs text-gray-400">
        Última alteração em {when}
        {meta.updated_by_name ? ` por ${meta.updated_by_name}` : ""}
      </p>
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Valores do Convênio</h1>
        <p className="text-gray-600">
          Altere o valor da assinatura sem precisar de deploy. Vale para novas
          contratações e para o que a Secretária Virtual informa aos pacientes.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-900">
          A mudança vale <strong>imediatamente</strong> para quem contratar a partir
          de agora. Assinaturas já pagas não são recalculadas, e cupons de desconto
          continuam sendo aplicados sobre o novo valor.
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>}
      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-6">{success}</div>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando valores...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-xl">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titular — valor anual
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                inputMode="decimal"
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                className="input pl-9"
                placeholder="350.00"
              />
            </div>
            {holderChanged && current && (
              <p className="mt-1 text-xs font-medium text-amber-700">
                {formatBRL(current.holder)} → {formatBRL(parsed(holder))}
              </p>
            )}
            {metaLine(holderMeta)}
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dependente — valor anual por pessoa
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                inputMode="decimal"
                value={dependent}
                onChange={(e) => setDependent(e.target.value)}
                className="input pl-9"
                placeholder="100.00"
              />
            </div>
            {dependentChanged && current && (
              <p className="mt-1 text-xs font-medium text-amber-700">
                {formatBRL(current.dependent)} → {formatBRL(parsed(dependent))}
              </p>
            )}
            {metaLine(dependentMeta)}
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="btn btn-primary flex items-center disabled:opacity-50"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Salvando..." : hasChanges ? "Salvar alterações" : "Sem alterações"}
          </button>
        </div>
      )}
    </div>
  );
};

export default ManagePricingPage;
