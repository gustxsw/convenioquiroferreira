import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchWithAuth, getApiUrl } from "../utils/apiHelpers";

const POLL_INTERVAL_MS = 15000;

// Conta as conversas pendentes (modo bot, não assumidas) para o badge do menu.
// Só faz polling para os papéis que enxergam o Atendimento, evitando requisições
// desnecessárias para os demais usuários.
export function usePendingCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const enabled =
    user?.currentRole === "secretaria" || user?.currentRole === "admin";

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    let active = true;

    const fetchCount = async () => {
      try {
        const response = await fetchWithAuth(
          `${getApiUrl()}/webhook/whatsapp/conversations`,
          { method: "GET" }
        );
        if (!response.ok) return;
        const data: Array<{ status: string }> = await response.json();
        if (active) {
          setCount(data.filter((c) => c.status === "pending").length);
        }
      } catch {
        /* silencioso: o badge é informativo, não bloqueia o uso */
      }
    };

    fetchCount();
    const id = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [enabled]);

  return count;
}
