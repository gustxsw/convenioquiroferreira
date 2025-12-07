export const getApiUrl = (): string => {
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
    const refreshToken = localStorage.getItem("refreshToken");

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
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      window.location.href = "/login";
      return null;
    }

    const data = await response.json();

    localStorage.setItem("token", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("user", JSON.stringify(data.user));

    return data.accessToken;
  } catch (error) {
    console.error("Error refreshing token:", error);
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    window.location.href = "/login";
    return null;
  }
};

export const fetchWithAuth = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  const token = localStorage.getItem("token");

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
          const newToken = localStorage.getItem("token");
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
