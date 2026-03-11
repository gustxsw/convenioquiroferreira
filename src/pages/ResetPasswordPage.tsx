import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Lock, ArrowLeft, Activity } from "lucide-react";
import { getApiUrl } from "../utils/apiHelpers";

const ResetPasswordPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get("token");
    setToken(t);
  }, [location.search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Link inválido. Solicite uma nova redefinição de senha.");
      return;
    }

    if (!password || !confirmPassword) {
      setError("Preencha todos os campos para continuar.");
      return;
    }

    if (password.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas digitadas não coincidem.");
      return;
    }

    setIsLoading(true);

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível redefinir a senha.");
      }

      setSuccess(
        data.message || "Senha redefinida com sucesso. Você já pode fazer login."
      );

      setTimeout(() => {
        navigate("/", { replace: true });
      }, 2500);
    } catch (err) {
      console.error("Erro ao redefinir senha:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Ocorreu um erro ao redefinir sua senha."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex flex-1">
        {/* Left side */}
        <div className="hidden lg:flex lg:w-[55%] relative">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900/90 to-gray-900/60 z-10" />
          <img
            src="/familiafeliz.jpg"
            alt="Família feliz"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="relative z-20 p-16 text-white w-full flex items-center">
            <div className="max-w-xl">
              <div className="flex items-center mb-8">
                <Activity className="h-10 w-10 mr-4" strokeWidth={1.5} />
                <h1 className="text-4xl font-light tracking-tight">
                  Crie uma nova senha
                </h1>
              </div>
              <p className="text-lg text-gray-200 leading-relaxed">
                Defina uma senha forte e mantenha seu acesso ao Convênio Quiro
                Ferreira sempre seguro.
              </p>
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="w-full lg:w-[45%] flex items-center justify-center p-8 bg-white">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h2 className="text-2xl font-light text-gray-900 mb-2">
                Redefinir senha
              </h2>
              <p className="text-gray-600 text-sm leading-relaxed">
                Escolha uma nova senha para acessar sua conta com segurança.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-4 text-sm">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Nova senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
                    placeholder="Digite a nova senha"
                    disabled={isLoading}
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Use pelo menos 6 caracteres. Prefira combinações de letras,
                  números e símbolos.
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Confirmar nova senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
                    placeholder="Repita a nova senha"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className={`w-full py-3 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors ${
                  isLoading ? "opacity-70 cursor-not-allowed" : ""
                }`}
                disabled={isLoading}
              >
                {isLoading ? "Salvando nova senha..." : "Confirmar nova senha"}
              </button>
            </form>

            <div className="mt-6">
              <Link
                to="/"
                className="inline-flex items-center text-sm text-gray-600 hover:text-gray-800"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar para o login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;

