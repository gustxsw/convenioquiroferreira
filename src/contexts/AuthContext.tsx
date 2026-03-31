import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { refreshAccessToken } from "../utils/apiHelpers";
import { logger } from "../utils/logger";

type User = {
  id: number;
  name: string;
  roles: string[];
  currentRole?: string;
};

type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    cpf: string,
    password: string
  ) => Promise<{ user: User; needsRoleSelection: boolean }>;
  selectRole: (userId: number, role: string) => Promise<void>;
  switchRole: (role: string) => Promise<void>;
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

  // Get API URL
  const getApiUrl = () => {
    if (
      window.location.hostname === "cartaoquiroferreira.com.br" ||
      window.location.hostname === "www.cartaoquiroferreira.com.br"
    ) {
      return "https://www.cartaoquiroferreira.com.br";
    }
    return "http://localhost:3001";
  };

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem("token");
        const refreshToken = localStorage.getItem("refreshToken");

        if (!token || !refreshToken) {
          localStorage.removeItem("user");
          localStorage.removeItem("tempUser");
          localStorage.removeItem("role");
          localStorage.removeItem("userType");
          setIsLoading(false);
          return;
        }

        const apiUrl = getApiUrl();

        let response = await fetch(`${apiUrl}/api/auth/me`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        });

        if (!response.ok) {
          const errorData = await response.json();

          if (errorData.code === "TOKEN_EXPIRED" && refreshToken) {
            logger.debug("Token expired during auth check - attempting refresh");
            const newToken = await refreshAccessToken();

            if (newToken) {
              response = await fetch(`${apiUrl}/api/auth/me`, {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${newToken}`,
                },
                credentials: "include",
              });

              if (!response.ok) {
                localStorage.removeItem("token");
                localStorage.removeItem("refreshToken");
                localStorage.removeItem("user");
                localStorage.removeItem("tempUser");
                localStorage.removeItem("role");
                localStorage.removeItem("userType");
                setUser(null);
                setIsLoading(false);
                return;
              }
            } else {
              localStorage.removeItem("token");
              localStorage.removeItem("refreshToken");
              localStorage.removeItem("user");
              localStorage.removeItem("tempUser");
              localStorage.removeItem("role");
              localStorage.removeItem("userType");
              setUser(null);
              setIsLoading(false);
              return;
            }
          } else {
            localStorage.removeItem("token");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("user");
            localStorage.removeItem("tempUser");
            localStorage.removeItem("role");
            localStorage.removeItem("userType");
            setUser(null);
            setIsLoading(false);
            return;
          }
        }

        const data = await response.json();

        localStorage.setItem("user", JSON.stringify(data.user));
        localStorage.removeItem("tempUser");
        localStorage.removeItem("role");
        localStorage.removeItem("userType");

        setUser(data.user);
      } catch {
        logger.error("Auth check error");
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        localStorage.removeItem("tempUser");
        localStorage.removeItem("role");
        localStorage.removeItem("userType");
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
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
  ): Promise<{ user: User; needsRoleSelection: boolean }> => {
    try {
      setIsLoading(true);

      const apiUrl = getApiUrl();
      logger.debug("Making login request", { endpoint: "/api/auth/login" });

      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

      return { user: userData, needsRoleSelection };
    } catch (error) {
      logger.error("Login error");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const selectRole = async (userId: number, role: string) => {
    try {
      setIsLoading(true);

      const apiUrl = getApiUrl();
      logger.debug("Selecting role");

      const response = await fetch(`${apiUrl}/api/auth/select-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, role }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao selecionar role");
      }

      const data = await response.json();

      localStorage.removeItem("tempUser");
      localStorage.removeItem("role");
      localStorage.removeItem("userType");

      localStorage.setItem("token", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("user", JSON.stringify(data.user));

      setUser(data.user);

      const selectedRole = data.user.currentRole;

      if (selectedRole === "client") {
        navigate("/client", { replace: true });
      } else if (selectedRole === "professional") {
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
      localStorage.removeItem("tempUser");
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const switchRole = async (role: string) => {
    try {
      setIsLoading(true);

      const apiUrl = getApiUrl();
      const token = localStorage.getItem("token");

      const response = await fetch(`${apiUrl}/api/auth/switch-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao trocar role");
      }

      const data = await response.json();

      localStorage.setItem("token", data.accessToken || data.token);
      if (data.refreshToken) {
        localStorage.setItem("refreshToken", data.refreshToken);
      }
      localStorage.setItem("user", JSON.stringify(data.user));

      setUser(data.user);

      const switchedRole = data.user.currentRole;

      if (switchedRole === "client") {
        navigate("/client", { replace: true });
      } else if (switchedRole === "professional") {
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
        },
        body: JSON.stringify({ userId }),
        credentials: "include",
      });

      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      localStorage.removeItem("tempUser");
      localStorage.removeItem("role");
      localStorage.removeItem("userType");

      setUser(null);
      navigate("/");
    } catch (error) {
      logger.error("Logout error");
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      localStorage.removeItem("tempUser");
      localStorage.removeItem("role");
      localStorage.removeItem("userType");
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
