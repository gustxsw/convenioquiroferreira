import React, { useState, useEffect } from "react";
import {
  UserPlus,
  Edit,
  Trash2,
  User,
  Search,
  Filter,
  Eye,
  EyeOff,
  X,
  Check,
  Shield,
  Briefcase,
  Users,
} from "lucide-react";

type User = {
  id: number;
  name: string;
  cpf: string;
  email: string;
  phone: string;
  roles: string[];
  subscription_status: string;
  subscription_expiry: string | null;
  created_at: string;
  category_name: string | null;
};

const ManageUsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    cpf: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    roles: [] as string[],
    category_name: "",
  });

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

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
    fetchUsers();
  }, []);

  useEffect(() => {
    let filtered = users;

    if (searchTerm) {
      filtered = filtered.filter(
        (user) =>
          user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.cpf.includes(searchTerm.replace(/\D/g, "")) ||
          user.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedRole) {
      filtered = filtered.filter((user) => user.roles.includes(selectedRole));
    }

    setFilteredUsers(filtered);
  }, [searchTerm, selectedRole, users]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      setError("");

      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      console.log("🔄 Fetching users from:", `${apiUrl}/api/users`);

      const response = await fetch(`${apiUrl}/api/users`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      console.log("📡 Users response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Users response error:", errorText);
        throw new Error(`Falha ao carregar usuários: ${response.status}`);
      }

      const data = await response.json();
      console.log("✅ Users loaded:", data.length);
      setUsers(data);
    } catch (error) {
      console.error("Error fetching users:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os usuários"
      );
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setModalMode("create");
    setFormData({
      name: "",
      cpf: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      roles: [],
      category_name: "",
    });
    setSelectedUser(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setModalMode("edit");
    setFormData({
      name: user.name,
      cpf: user.cpf,
      email: user.email || "",
      phone: user.phone || "",
      password: "",
      confirmPassword: "",
      roles: user.roles || [],
      category_name: user.category_name || "",
    });
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setError("");
    setSuccess("");
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRoleChange = (role: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      roles: checked
        ? [...prev.roles, role]
        : prev.roles.filter((r) => r !== role),
    }));
  };

  const formatCpf = (value: string) => {
    const numericValue = value.replace(/\D/g, "");
    const limitedValue = numericValue.slice(0, 11);
    setFormData((prev) => ({ ...prev, cpf: limitedValue }));
  };

  const formatPhone = (value: string) => {
    const numericValue = value.replace(/\D/g, "");
    const limitedValue = numericValue.slice(0, 11);
    setFormData((prev) => ({ ...prev, phone: limitedValue }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      setError("Nome é obrigatório");
      return false;
    }

    if (!formData.cpf) {
      setError("CPF é obrigatório");
      return false;
    }

    if (!/^\d{11}$/.test(formData.cpf)) {
      setError("CPF deve conter 11 dígitos numéricos");
      return false;
    }

    if (formData.roles.length === 0) {
      setError("Pelo menos uma role deve ser selecionada");
      return false;
    }

    if (modalMode === "create") {
      if (!formData.password) {
        setError("Senha é obrigatória");
        return false;
      }

      if (formData.password.length < 6) {
        setError("Senha deve ter pelo menos 6 caracteres");
        return false;
      }

      if (formData.password !== formData.confirmPassword) {
        setError("Senhas não coincidem");
        return false;
      }
    }

    if (modalMode === "edit" && formData.password) {
      if (formData.password.length < 6) {
        setError("Nova senha deve ter pelo menos 6 caracteres");
        return false;
      }

      if (formData.password !== formData.confirmPassword) {
        setError("Senhas não coincidem");
        return false;
      }
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError("Email inválido");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validateForm()) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const userData = {
        name: formData.name.trim(),
        cpf: formData.cpf,
        email: formData.email.trim() || null,
        phone: formData.phone.replace(/\D/g, "") || null,
        roles: formData.roles,
        category_name: formData.category_name.trim() || null,
      };

      if (modalMode === "create") {
        // Create user
        const response = await fetch(`${apiUrl}/api/users`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...userData,
            password: formData.password,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Falha ao criar usuário");
        }

        setSuccess("Usuário criado com sucesso!");
      } else if (modalMode === "edit" && selectedUser) {
        // Update user
        const updateData = { ...userData };
        
        if (formData.password) {
          updateData.password = formData.password;
        }

        const response = await fetch(`${apiUrl}/api/users/${selectedUser.id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Falha ao atualizar usuário");
        }

        setSuccess("Usuário atualizado com sucesso!");
      }

      // Refresh users list
      await fetchUsers();

      // Close modal after short delay
      setTimeout(() => {
        closeModal();
      }, 1500);
    } catch (error) {
      console.error("Error saving user:", error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Ocorreu um erro ao processar a solicitação");
      }
    }
  };

  const confirmDelete = (user: User) => {
    setUserToDelete(user);
    setShowDeleteConfirm(true);
  };

  const cancelDelete = () => {
    setUserToDelete(null);
    setShowDeleteConfirm(false);
  };

  const deleteUser = async () => {
    if (!userToDelete) return;

    try {
      const token = localStorage.getItem("token");
      const apiUrl = getApiUrl();

      const response = await fetch(`${apiUrl}/api/users/${userToDelete.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao excluir usuário");
      }

      // Refresh users list
      await fetchUsers();

      setSuccess("Usuário excluído com sucesso!");
    } catch (error) {
      console.error("Error deleting user:", error);
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError("Ocorreu um erro ao excluir o usuário");
      }
    } finally {
      setUserToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  const formatCpfDisplay = (cpf: string) => {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  const formatPhoneDisplay = (phone: string) => {
    if (!phone) return "";
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const getRoleDisplay = (roles: string[]) => {
    const roleLabels = {
      client: "Cliente",
      professional: "Profissional",
      admin: "Administrador",
    };

    return roles
      .map((role) => roleLabels[role as keyof typeof roleLabels] || role)
      .join(", ");
  };

  const getRoleIcon = (roles: string[]) => {
    if (roles.includes("admin")) {
      return <Shield className="h-4 w-4 text-red-600" />;
    } else if (roles.includes("professional")) {
      return <Briefcase className="h-4 w-4 text-blue-600" />;
    } else if (roles.includes("client")) {
      return <User className="h-4 w-4 text-green-600" />;
    }
    return <User className="h-4 w-4 text-gray-600" />;
  };

  const getSubscriptionStatusDisplay = (status: string) => {
    switch (status) {
      case "active":
        return {
          text: "Ativo",
          className: "bg-green-100 text-green-800",
        };
      case "pending":
        return {
          text: "Pendente",
          className: "bg-yellow-100 text-yellow-800",
        };
      case "expired":
        return {
          text: "Vencido",
          className: "bg-red-100 text-red-800",
        };
      default:
        return {
          text: "N/A",
          className: "bg-gray-100 text-gray-800",
        };
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Gerenciar Usuários
          </h1>
          <p className="text-gray-600">
            Adicione, edite ou remova usuários do sistema
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="btn btn-primary flex items-center"
        >
          <UserPlus className="h-5 w-5 mr-2" />
          Novo Usuário
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center mb-4">
          <Filter className="h-5 w-5 text-red-600 mr-2" />
          <h2 className="text-lg font-semibold">Filtros</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, CPF ou email..."
              className="input pl-10"
            />
          </div>

          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="input"
          >
            <option value="">Todas as roles</option>
            <option value="client">Clientes</option>
            <option value="professional">Profissionais</option>
            <option value="admin">Administradores</option>
          </select>

          <button
            onClick={() => {
              setSearchTerm("");
              setSelectedRole("");
            }}
            className="btn btn-secondary"
          >
            Limpar Filtros
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-6">
          {success}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando usuários...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || selectedRole
                ? "Nenhum usuário encontrado"
                : "Nenhum usuário cadastrado"}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || selectedRole
                ? "Tente ajustar os filtros de busca."
                : "Comece adicionando o primeiro usuário do sistema."}
            </p>
            {!searchTerm && !selectedRole && (
              <button
                onClick={openCreateModal}
                className="btn btn-primary inline-flex items-center"
              >
                <UserPlus className="h-5 w-5 mr-2" />
                Adicionar Primeiro Usuário
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usuário
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Roles
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categoria
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data de Cadastro
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => {
                  const statusInfo = getSubscriptionStatusDisplay(
                    user.subscription_status
                  );
                  return (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                              {getRoleIcon(user.roles)}
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {user.name}
                            </div>
                            <div className="text-sm text-gray-500">
                              CPF: {formatCpfDisplay(user.cpf)}
                            </div>
                            {user.email && (
                              <div className="text-sm text-gray-500">
                                {user.email}
                              </div>
                            )}
                            {user.phone && (
                              <div className="text-sm text-gray-500">
                                {formatPhoneDisplay(user.phone)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <span
                              key={role}
                              className={`px-2 py-1 text-xs font-medium rounded-full ${
                                role === "admin"
                                  ? "bg-red-100 text-red-800"
                                  : role === "professional"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-green-100 text-green-800"
                              }`}
                            >
                              {getRoleDisplay([role])}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">
                          {user.category_name || "Sem categoria"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${statusInfo.className}`}
                        >
                          {statusInfo.text}
                        </span>
                        {user.subscription_expiry &&
                          user.subscription_status === "active" && (
                            <div className="text-xs text-gray-500 mt-1">
                              Expira: {formatDate(user.subscription_expiry)}
                            </div>
                          )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openEditModal(user)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(user)}
                            className="text-red-600 hover:text-red-900"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User form modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">
                {modalMode === "create" ? "Novo Usuário" : "Editar Usuário"}
              </h2>
            </div>

            {error && (
              <div className="mx-6 mt-4 bg-red-50 text-red-600 p-3 rounded-lg">
                {error}
              </div>
            )}

            {success && (
              <div className="mx-6 mt-4 bg-green-50 text-green-600 p-3 rounded-lg">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-6">
                {/* Personal Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Informações Pessoais
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nome Completo *
                      </label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="input"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        CPF *
                      </label>
                      <input
                        type="text"
                        value={
                          formData.cpf
                            ? formatCpfDisplay(formData.cpf)
                            : ""
                        }
                        onChange={(e) => formatCpf(e.target.value)}
                        className="input"
                        placeholder="000.000.000-00"
                        disabled={modalMode === "edit"}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Telefone
                      </label>
                      <input
                        type="text"
                        value={
                          formData.phone
                            ? formatPhoneDisplay(formData.phone)
                            : ""
                        }
                        onChange={(e) => formatPhone(e.target.value)}
                        className="input"
                        placeholder="(00) 00000-0000"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Categoria/Especialidade
                      </label>
                      <input
                        type="text"
                        name="category_name"
                        value={formData.category_name}
                        onChange={handleInputChange}
                        className="input"
                        placeholder="Ex: Fisioterapeuta, Nutricionista, etc."
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Especialmente importante para profissionais
                      </p>
                    </div>
                  </div>
                </div>

                {/* Roles */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Permissões de Acesso *
                  </h3>

                  <div className="space-y-3">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.roles.includes("client")}
                        onChange={(e) =>
                          handleRoleChange("client", e.target.checked)
                        }
                        className="rounded border-gray-300 text-red-600 shadow-sm focus:border-red-300 focus:ring focus:ring-red-200 focus:ring-opacity-50"
                      />
                      <span className="ml-3 flex items-center">
                        <User className="h-4 w-4 text-green-600 mr-2" />
                        <span className="font-medium">Cliente</span>
                        <span className="text-gray-500 text-sm ml-2">
                          - Acesso ao painel de cliente
                        </span>
                      </span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.roles.includes("professional")}
                        onChange={(e) =>
                          handleRoleChange("professional", e.target.checked)
                        }
                        className="rounded border-gray-300 text-red-600 shadow-sm focus:border-red-300 focus:ring focus:ring-red-200 focus:ring-opacity-50"
                      />
                      <span className="ml-3 flex items-center">
                        <Briefcase className="h-4 w-4 text-blue-600 mr-2" />
                        <span className="font-medium">Profissional</span>
                        <span className="text-gray-500 text-sm ml-2">
                          - Acesso ao painel profissional
                        </span>
                      </span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.roles.includes("admin")}
                        onChange={(e) =>
                          handleRoleChange("admin", e.target.checked)
                        }
                        className="rounded border-gray-300 text-red-600 shadow-sm focus:border-red-300 focus:ring focus:ring-red-200 focus:ring-opacity-50"
                      />
                      <span className="ml-3 flex items-center">
                        <Shield className="h-4 w-4 text-red-600 mr-2" />
                        <span className="font-medium">Administrador</span>
                        <span className="text-gray-500 text-sm ml-2">
                          - Acesso total ao sistema
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                {/* Password */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {modalMode === "create" ? "Senha *" : "Alterar Senha"}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {modalMode === "create" ? "Senha *" : "Nova Senha"}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          name="password"
                          value={formData.password}
                          onChange={handleInputChange}
                          className="input pr-10"
                          placeholder="Mínimo 6 caracteres"
                          required={modalMode === "create"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirmar Senha {modalMode === "create" ? "*" : ""}
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          name="confirmPassword"
                          value={formData.confirmPassword}
                          onChange={handleInputChange}
                          className="input pr-10"
                          placeholder="Digite a senha novamente"
                          required={modalMode === "create"}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setShowConfirmPassword(!showConfirmPassword)
                          }
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {modalMode === "edit" && (
                    <p className="text-xs text-gray-500 mt-2">
                      Deixe em branco para manter a senha atual
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {modalMode === "create"
                    ? "Criar Usuário"
                    : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Confirmar Exclusão</h2>

            <p className="mb-6">
              Tem certeza que deseja excluir o usuário{" "}
              <strong>{userToDelete.name}</strong>? Esta ação não pode ser
              desfeita.
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDelete}
                className="btn btn-secondary flex items-center"
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </button>
              <button
                onClick={deleteUser}
                className="btn bg-red-600 text-white hover:bg-red-700 flex items-center"
              >
                <Check className="h-4 w-4 mr-2" />
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageUsersPage;