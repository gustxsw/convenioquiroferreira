import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getApiUrl, refreshAccessToken } from "../utils/apiHelpers";
import { logger } from "../utils/logger";
import { ls } from "../utils/storage";

export type ProfessionalType = "agenda_only" | "convenio";

type User = {
  id: number;
  name: string;
  roles: string[];
  currentRole?: string;
  /** Present for users with role professional; set by API */
  professionalType?: ProfessionalType;
  primarySpecialtyCode?: string | null;
  onboardingStatus?: "pending" | "completed" | null;
  /** Profissional vinculado quando currentRole é secretaria */
  linkedProfessionalId?: number | null;
};

type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    cpf: string,
    password: string
  ) => Promise<{
    user: User;
    needsRoleSelection: boolean;
    preAuthToken: string;
  }>;
  selectRole: (
    userId: number,
    role: string,
    preAuthToken: string
  ) => Promise<void>;
  switchRole: (role: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Sequence number incremented on every login/logout/role change.
  // Late responses from in-flight /api/auth/me must be ignored when the
  // session "version" no longer matches, otherwise stale responses can
  // overwrite the freshly-logged-in user with another user's data.
  const sessionVersionRef = useRef(0);
  const authCheckAbortRef = useRef<AbortController | null>(null);

  const clearLocalAuthState = () => {
    ls.remove("token");
    ls.remove("refreshToken");
    ls.remove("user");
    ls.remove("tempUser");
    ls.remove("role");
    ls.remove("userType");
  };

  const invalidatePendingAuthChecks = () => {
    sessionVersionRef.current += 1;
    if (authCheckAbortRef.current) {
      authCheckAbortRef.current.abort();
      authCheckAbortRef.current = null;
    }
  };

  useEffect(() => {
    const versionAtStart = sessionVersionRef.current;
    const controller = new AbortController();
    authCheckAbortRef.current = controller;

    const isStillCurrent = () =>
      sessionVersionRef.current === versionAtStart && !controller.signal.aborted;

    const checkAuthStatus = async () => {
      try {
        const token = ls.get("token");
        const refreshToken = ls.get("refreshToken");

        if (!token || !refreshToken) {
          if (!isStillCurrent()) return;
          clearLocalAuthState();
          setIsLoading(false);
          return;
        }

        const apiUrl = getApiUrl();

        let response = await fetch(`${apiUrl}/api/auth/me`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-store",
          },
          credentials: "include",
          signal: controller.signal,
        });

        if (!isStillCurrent()) return;

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (!isStillCurrent()) return;

          if (errorData.code === "TOKEN_EXPIRED" && refreshToken) {
            logger.debug("Token expired during auth check - attempting refresh");
            const newToken = await refreshAccessToken();
            if (!isStillCurrent()) return;

            if (newToken) {
              response = await fetch(`${apiUrl}/api/auth/me`, {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${newToken}`,
                  "Cache-Control": "no-store",
                },
                credentials: "include",
                signal: controller.signal,
              });

              if (!isStillCurrent()) return;

              if (!response.ok) {
                clearLocalAuthState();
                setUser(null);
                setIsLoading(false);
                return;
              }
            } else {
              clearLocalAuthState();
              setUser(null);
              setIsLoading(false);
              return;
            }
          } else {
            clearLocalAuthState();
            setUser(null);
            setIsLoading(false);
            return;
          }
        }

        const data = await response.json();

        if (!isStillCurrent()) return;

        // Sanity check: the token currently in localStorage must still be the
        // same one we used for this request. If the user logged in/out during
        // the in-flight request, abort and let the new flow set the state.
        const currentToken = ls.get("token");
        if (currentToken !== token && currentToken !== null) {
          // A newer login already happened — do NOT overwrite the new state
          // with the old user's payload.
          return;
        }

        // Defensive: ensure the response actually corresponds to the user
        // whose token we sent. If for any reason (CDN cache, proxy, etc.) the
        // response belongs to another user, drop it instead of trusting it.
        if (!data?.user?.id) {
          clearLocalAuthState();
          setUser(null);
          setIsLoading(false);
          return;
        }

        ls.set("user", JSON.stringify(data.user));
        ls.remove("tempUser");
        ls.remove("role");
        ls.remove("userType");

        setUser(data.user);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") {
          return;
        }
        if (!isStillCurrent()) return;
        logger.error("Auth check error");
        clearLocalAuthState();
        setUser(null);
      } finally {
        if (isStillCurrent()) {
          setIsLoading(false);
        }
      }
    };

    checkAuthStatus();

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [user, navigate]);

  const login = async (
    cpf: string,
    password: string
  ): Promise<{
    user: User;
    needsRoleSelection: boolean;
    preAuthToken: string;
  }> => {
    try {
      setIsLoading(true);

      // Critical: invalidate any in-flight /api/auth/me from a previous
      // session AND wipe any leftover auth artifacts from a prior user
      // before starting a new login. Prevents stale data from the old
      // session being merged into the new one.
      invalidatePendingAuthChecks();
      clearLocalAuthState();
      setUser(null);

      const apiUrl = getApiUrl();
      logger.debug("Making login request", { endpoint: "/api/auth/login" });

      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ cpf, password }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          throw new Error("Erro de conexão com o servidor");
        }
        throw new Error(errorData.message || "Credenciais inválidas");
      }

      const data = await response.json();

      const userData = data.user;
      const needsRoleSelection = userData.roles && userData.roles.length > 1;
      const preAuthToken: string = data.preAuthToken || "";

      if (!preAuthToken) {
        throw new Error("Erro de autenticação: token ausente");
      }

      return { user: userData, needsRoleSelection, preAuthToken };
    } catch (error) {
      logger.error("Login error");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const selectRole = async (
    userId: number,
    role: string,
    preAuthToken: string
  ) => {
    try {
      setIsLoading(true);

      if (!preAuthToken) {
        throw new Error("Sessão de login inválida. Faça login novamente.");
      }

      // Invalidate any pending auth checks BEFORE issuing new tokens, so a
      // late /api/auth/me from a previous user cannot overwrite the state.
      invalidatePendingAuthChecks();

      const apiUrl = getApiUrl();
      logger.debug("Selecting role");

      const response = await fetch(`${apiUrl}/api/auth/select-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ userId, role, preAuthToken }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao selecionar role");
      }

      const data = await response.json();

      ls.remove("tempUser");
      ls.remove("role");
      ls.remove("userType");

      ls.set("token", data.accessToken);
      ls.set("refreshToken", data.refreshToken);
      ls.set("user", JSON.stringify(data.user));

      // Bump the session version AGAIN after we've written the new token to
      // localStorage so any in-flight check that sneaked past the first
      // invalidation cannot win the race.
      invalidatePendingAuthChecks();

      setUser(data.user);

      const selectedRole = data.user.currentRole;

      if (selectedRole === "client") {
        navigate("/client", { replace: true });
      } else if (selectedRole === "professional") {
        navigate("/professional", { replace: true });
      } else if (selectedRole === "secretaria") {
        navigate("/professional", { replace: true });
      } else if (selectedRole === "admin") {
        navigate("/admin", { replace: true });
      } else if (selectedRole === "vendedor") {
        navigate("/affiliate", { replace: true });
      } else if (selectedRole === "financeiro_agenda") {
        navigate("/financeiro/agenda", { replace: true });
      }
    } catch (error) {
      logger.error("Role selection error");
      ls.remove("tempUser");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSession = async () => {
    const token = ls.get("token");
    const refreshToken = ls.get("refreshToken");
    if (!token || !refreshToken) return;

    const versionAtStart = sessionVersionRef.current;
    const apiUrl = getApiUrl();
    let response = await fetch(`${apiUrl}/api/auth/me`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-store",
      },
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (errorData.code === "TOKEN_EXPIRED" && refreshToken) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          response = await fetch(`${apiUrl}/api/auth/me`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newToken}`,
              "Cache-Control": "no-store",
            },
            credentials: "include",
          });
        }
      }
    }

    if (response.ok) {
      const data = await response.json();
      // If the user logged in/out while the request was in flight, drop it.
      if (sessionVersionRef.current !== versionAtStart) return;
      const currentToken = ls.get("token");
      if (currentToken !== token && currentToken !== null) return;
      if (!data?.user?.id) return;
      ls.set("user", JSON.stringify(data.user));
      setUser(data.user);
    }
  };

  const switchRole = async (role: string) => {
    try {
      setIsLoading(true);
      invalidatePendingAuthChecks();

      const apiUrl = getApiUrl();
      const token = ls.get("token");

      const response = await fetch(`${apiUrl}/api/auth/switch-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ role }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao trocar role");
      }

      const data = await response.json();

      ls.set("token", data.accessToken || data.token);
      if (data.refreshToken) {
        ls.set("refreshToken", data.refreshToken);
      }
      ls.set("user", JSON.stringify(data.user));

      setUser(data.user);

      const switchedRole = data.user.currentRole;

      if (switchedRole === "client") {
        navigate("/client", { replace: true });
      } else if (switchedRole === "professional") {
        navigate("/professional", { replace: true });
      } else if (switchedRole === "secretaria") {
        navigate("/professional", { replace: true });
      } else if (switchedRole === "admin") {
        navigate("/admin", { replace: true });
      } else if (switchedRole === "vendedor") {
        navigate("/affiliate", { replace: true });
      } else if (switchedRole === "financeiro_agenda") {
        navigate("/financeiro/agenda", { replace: true });
      }
    } catch (error) {
      logger.error("Role switch error");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);

      // Invalidate any pending requests immediately so a late /api/auth/me
      // cannot resurrect the session after the user has logged out.
      invalidatePendingAuthChecks();

      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }

      const apiUrl = getApiUrl();
      const userId = user?.id;

      await fetch(`${apiUrl}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ userId }),
        credentials: "include",
      });

      clearLocalAuthState();
      // Belt and suspenders: nuke anything else that might be cached on
      // this origin (other libs occasionally leave per-user state behind).
      try {
        sessionStorage.clear();
      } catch {
        /* ignore */
      }

      setUser(null);
      navigate("/");
    } catch (error) {
      logger.error("Logout error");
      clearLocalAuthState();
      setUser(null);
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    selectRole,
    switchRole,
    refreshSession,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
};
