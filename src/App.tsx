import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";

// Layouts
import MainLayout from "./layouts/MainLayout";
import AuthLayout from "./layouts/AuthLayout";

// Pages
import LoginPage from "./pages/LoginPage";
import RoleSelectionPage from "./pages/RoleSelectionPage";
import RegisterPage from "./pages/RegisterPage";
import ClientHomePage from "./pages/client/ClientHomePage";
import ProfessionalsPage from "./pages/client/ProfessionalsPage";
import ProfessionalHomePage from "./pages/professional/ProfessionalHomePage";
import RegisterConsultationPage from "./pages/professional/RegisterConsultationPage";
import AdminHomePage from "./pages/admin/AdminHomePage";
import ManageUsersPage from "./pages/admin/ManageUsersPage";
import ManageServicesPage from "./pages/admin/ManageServicesPage";
import ReportsPage from "./pages/admin/ReportsPage";
import NotFoundPage from "./pages/NotFoundPage";

// Route guards
const ProtectedRoute = ({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles: string[];
}) => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (
    allowedRoles.length > 0 &&
    user &&
    !allowedRoles.includes(user.currentRole || "")
  ) {
    // Redirect to appropriate home page based on current role
    if (user.currentRole === "client") {
      return <Navigate to="/client" replace />;
    } else if (user.currentRole === "professional") {
      return <Navigate to="/professional" replace />;
    } else if (user.currentRole === "admin") {
      return <Navigate to="/admin" replace />;
    }
  }

  return <>{children}</>;
};

// 🔥🔥🔥 COMPONENTE PARA FORÇAR REDIRECIONAMENTO - SIMPLIFICADO 🔥🔥🔥
const RootRedirect: React.FC = () => {
  const location = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  console.log('🔥 RootRedirect - pathname:', location.pathname);
  console.log('🔥 RootRedirect - isAuthenticated:', isAuthenticated);
  console.log('🔥 RootRedirect - isLoading:', isLoading);

  // 🔥 SEMPRE REDIRECIONAR PARA /login SE ESTIVER NA RAIZ
  if (location.pathname === '/') {
    console.log('🔥 ROOT PATH - IMMEDIATE REDIRECT TO /login');
    return <Navigate to="/login" replace />;
  }

  // Se está carregando, mostrar loading
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  // Se não está autenticado, redirecionar para login
  if (!isAuthenticated) {
    console.log('🔥 Not authenticated - redirecting to login');
    return <Navigate to="/login" replace />;
  }

  // Se está autenticado, redirecionar baseado na role
  if (user?.currentRole === "client") {
    console.log('🔥 Client role - redirecting to /client');
    return <Navigate to="/client" replace />;
  } else if (user?.currentRole === "professional") {
    console.log('🔥 Professional role - redirecting to /professional');
    return <Navigate to="/professional" replace />;
  } else if (user?.currentRole === "admin") {
    console.log('🔥 Admin role - redirecting to /admin');
    return <Navigate to="/admin" replace />;
  }

  console.log('🔥 No valid role - redirecting to login');
  return <Navigate to="/login" replace />;
};

function App() {
  const { isLoading } = useAuth();

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* 🔥🔥🔥 ROOT ROUTE - SEMPRE REDIRECIONA PARA /login 🔥🔥🔥 */}
      <Route path="/" element={<RootRedirect />} />

      {/* Auth routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/select-role" element={<RoleSelectionPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Client routes */}
      <Route
        element={
          <ProtectedRoute allowedRoles={["client"]}>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/client" element={<ClientHomePage />} />
        <Route path="/client/professionals" element={<ProfessionalsPage />} />
      </Route>

      {/* Professional routes */}
      <Route
        element={
          <ProtectedRoute allowedRoles={["professional"]}>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/professional" element={<ProfessionalHomePage />} />
        <Route
          path="/professional/register-consultation"
          element={<RegisterConsultationPage />}
        />
      </Route>

      {/* Admin routes */}
      <Route
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<AdminHomePage />} />
        <Route path="/admin/users" element={<ManageUsersPage />} />
        <Route path="/admin/services" element={<ManageServicesPage />} />
        <Route path="/admin/reports" element={<ReportsPage />} />
      </Route>

      {/* Not found */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;