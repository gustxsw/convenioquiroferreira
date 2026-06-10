import { ls } from "./storage";

/**
 * URL base da API. Em produção, defina VITE_API_URL no build se o front e o back
 * estiverem em domínios diferentes (evita chamar localhost ou outro host errado).
 */
export const getApiUrl = (): string => {
  const fromEnv = import.meta.env.VITE_API_URL as string | undefined;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).trim().replace(/\/$/, "");
  }
  if (
    window.location.hostname === "cartaoquiroferreira.com.br" ||
    window.location.hostname === "www.cartaoquiroferreira.com.br"
  ) {
    return "https://www.cartaoquiroferreira.com.br";
  }
  return "http://localhost:3001";
};

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

export const refreshAccessToken = async (): Promise<string | null> => {
  try {
    const refreshToken = ls.get("refreshToken");

    if (!refreshToken) {
      return null;
    }

    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      ls.remove("token");
      ls.remove("refreshToken");
      ls.remove("user");
      ls.remove("tempUser");
      ls.remove("role");
      ls.remove("userType");
      window.location.href = "/";
      return null;
    }

    const data = await response.json();

    ls.set("token", data.accessToken);
    ls.set("refreshToken", data.refreshToken);
    ls.set("user", JSON.stringify(data.user));

    return data.accessToken;
  } catch (error) {
    // Intentionally silent in UI console to avoid leaking sensitive auth context.
    ls.remove("token");
    ls.remove("refreshToken");
    ls.remove("user");
    ls.remove("tempUser");
    ls.remove("role");
    ls.remove("userType");
    window.location.href = "/";
    return null;
  }
};

export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = ls.get("token");

  const headers = {
    ...options.headers,
    Authorization: token ? `Bearer ${token}` : "",
  };

  let response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    const data = await response.json();

    if (data.code === "TOKEN_EXPIRED") {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          const newToken = ls.get("token");
          return fetch(url, {
            ...options,
            headers: {
              ...options.headers,
              Authorization: newToken ? `Bearer ${newToken}` : "",
            },
          });
        }) as Promise<Response>;
      }

      isRefreshing = true;

      try {
        const newAccessToken = await refreshAccessToken();

        if (newAccessToken) {
          processQueue(null, newAccessToken);

          response = await fetch(url, {
            ...options,
            headers: {
              ...options.headers,
              Authorization: `Bearer ${newAccessToken}`,
            },
          });
        } else {
          processQueue(new Error("Failed to refresh token"), null);
        }
      } catch (error) {
        processQueue(error as Error, null);
        throw error;
      } finally {
        isRefreshing = false;
      }
    }
  }

  return response;
};

/** PDF do prontuário via API autenticada (o link público em pdf_url pode retornar 401 no navegador). */
export async function fetchMedicalRecordPdf(
  recordId: number
): Promise<{ ok: true; blob: Blob } | { ok: false; message: string }> {
  const apiUrl = getApiUrl();
  const res = await fetchWithAuth(
    `${apiUrl}/api/medical-records/${recordId}/pdf`
  );
  if (!res.ok) {
    let message = "Não foi possível carregar o PDF";
    try {
      const j = (await res.json()) as { message?: string };
      if (j?.message) message = j.message;
    } catch {
      /* resposta não JSON */
    }
    return { ok: false, message };
  }
  const blob = await res.blob();
  return { ok: true, blob };
}

/** PDF de documento (atestado, receituário etc.) via API autenticada. */
export async function fetchDocumentPdf(
  documentId: number
): Promise<{ ok: true; blob: Blob } | { ok: false; message: string }> {
  const apiUrl = getApiUrl();
  const res = await fetchWithAuth(`${apiUrl}/api/documents/${documentId}/pdf`);
  if (!res.ok) {
    let message = "Não foi possível carregar o documento";
    try {
      const j = (await res.json()) as { message?: string };
      if (j?.message) message = j.message;
    } catch {
      /* resposta não JSON */
    }
    return { ok: false, message };
  }
  const blob = await res.blob();
  return { ok: true, blob };
}
