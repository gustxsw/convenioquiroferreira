import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, Activity } from "lucide-react";
import { getApiUrl } from "../utils/apiHelpers";

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email) {
      setError("Informe o e-mail cadastrado para continuar.");
      return;
    }

    setIsLoading(true);

    try {
      const apiUrl = getApiUrl();
      const response = await fetch(`${apiUrl}/api/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Não foi possível processar a solicitação.");
      }

      setSuccess(
        data.message ||
          "Se este e-mail estiver cadastrado, você receberá instruções para redefinir sua senha."
      );
    } catch (err) {
      console.error("Erro ao solicitar redefinição de senha:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Ocorreu um erro ao processar sua solicitação."
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
                  Segurança e praticidade
                </h1>
              </div>
              <p className="text-lg text-gray-200 leading-relaxed">
                Redefina sua senha com segurança em poucos passos. Seu acesso ao
                Convênio Quiro Ferreira sempre protegido.
              </p>
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="w-full lg:w-[45%] flex items-center justify-center p-8 bg-white">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h2 className="text-2xl font-light text-gray-900 mb-2">
                Esqueceu sua senha?
              </h2>
              <p className="text-gray-600 text-sm leading-relaxed">
                Informe o e-mail cadastrado na sua conta. Enviaremos um link seguro
                para você criar uma nova senha.
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
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  E-mail cadastrado
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all"
                    placeholder="seuemail@exemplo.com"
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
                {isLoading ? "Enviando..." : "Enviar link de redefinição"}
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

export default ForgotPasswordPage;

