import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import {
  SPECIALTY_CODES,
  getSpecialtyLabelPt,
  type SpecialtyCode,
} from "../../config/specialtyTemplates";
import { Check, ArrowLeft } from "lucide-react";

const ProfessionalOnboardingPage: React.FC = () => {
  const { user, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<SpecialtyCode | "">("");
  const [confirmCapacity, setConfirmCapacity] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [featuresOn, setFeaturesOn] = useState(true);

  useEffect(() => {
    if (
      user?.currentRole !== "professional" &&
      user?.currentRole !== "secretaria"
    ) {
      navigate("/professional", { replace: true });
      return;
    }
    if (user?.onboardingStatus === "completed" && user?.primarySpecialtyCode) {
      navigate("/professional/medical-records", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth(
          `${getApiUrl()}/api/professional/features`
        );
        if (res.ok) {
          const data = await res.json();
          setFeaturesOn(data.specialtyOnboarding !== false);
        }
      } catch {
        setFeaturesOn(true);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!selected) {
      setError("Selecione sua especialidade principal.");
      return;
    }
    if (!confirmCapacity) {
      setError(
        "Confirme que atua nesta área como profissional habilitado."
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithAuth(
        `${getApiUrl()}/api/professional/onboarding/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primary_specialty_code: selected,
            confirmProfessionalCapacity: true,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Não foi possível salvar.");
      }
      await refreshSession();
      navigate("/professional/medical-records", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao concluir cadastro."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!featuresOn) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4">
        <p className="text-gray-700">
          O cadastro de especialidade está temporariamente indisponível. Tente
          novamente mais tarde.
        </p>
        <Link
          to="/professional"
          className="mt-4 inline-flex items-center text-red-600 hover:underline"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar ao início
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <Link
        to="/professional"
        className="inline-flex items-center text-sm text-gray-600 hover:text-red-600 mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Voltar ao painel
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Sua área de atuação
      </h1>
      <p className="text-gray-600 mb-8">
        Escolha a especialidade principal para personalizar seus prontuários.
        Você poderá alterar depois em Perfil; prontuários já criados mantêm o
        modelo da data em que foram abertos.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-3 block">
            Especialidade principal *
          </legend>
          <div className="grid gap-2">
            {SPECIALTY_CODES.map((code) => (
              <label
                key={code}
                className={`flex cursor-pointer items-center rounded-lg border p-3 transition-colors ${
                  selected === code
                    ? "border-red-500 bg-red-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="specialty"
                  value={code}
                  checked={selected === code}
                  onChange={() => setSelected(code)}
                  className="h-4 w-4 text-red-600"
                />
                <span className="ml-3 text-gray-900">
                  {getSpecialtyLabelPt(code)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmCapacity}
            onChange={(e) => setConfirmCapacity(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-red-600"
          />
          <span className="text-sm text-gray-700">
            Confirmo que atuo nesta área como profissional habilitado e que os
            dados informados são verdadeiros.
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full btn btn-primary flex items-center justify-center gap-2 py-3 disabled:opacity-50"
        >
          {submitting ? (
            "Salvando..."
          ) : (
            <>
              <Check className="h-5 w-5" />
              Concluir e ir para prontuários
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default ProfessionalOnboardingPage;
