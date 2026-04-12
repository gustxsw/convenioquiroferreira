import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { fetchWithAuth, getApiUrl } from "../utils/apiHelpers";
import { AlertTriangle } from "lucide-react";

const ProfessionalOnboardingBanner: React.FC = () => {
  const { user } = useAuth();
  const [specialtyOn, setSpecialtyOn] = useState(true);

  useEffect(() => {
    if (user?.currentRole !== "professional") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(
          `${getApiUrl()}/api/professional/features`
        );
        if (!cancelled && res.ok) {
          const data = await res.json();
          setSpecialtyOn(data.specialtyOnboarding !== false);
        }
      } catch {
        if (!cancelled) setSpecialtyOn(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.currentRole]);

  if (
    user?.currentRole !== "professional" ||
    !specialtyOn ||
    user.onboardingStatus === "completed"
  ) {
    return null;
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">
              Defina sua área de atuação
            </p>
            <p className="text-sm text-amber-900/90">
              Enquanto isso não for feito, você não poderá{" "}
              <strong>criar novos prontuários</strong> no modelo da sua
              especialidade. O restante do painel continua disponível.
            </p>
          </div>
        </div>
        <Link
          to="/professional/onboarding"
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
        >
          Definir especialidade
        </Link>
      </div>
    </div>
  );
};

export default ProfessionalOnboardingBanner;
