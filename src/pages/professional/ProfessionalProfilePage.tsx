import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  User,
  MapPin,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Save,
  X,
  Check,
  FileImage,
  Upload,
  MessageCircle,
  Briefcase,
  Phone,
} from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import { getProfessionalActorId } from "../../utils/professionalActor";
import {
  SPECIALTY_CODES,
  getSpecialtyLabelPt,
  type SpecialtyCode,
} from "../../config/specialtyTemplates";
import {
  CONVENIO_OWNER_DISPLAY_PHONE,
  CONVENIO_PROMO_CTA_LINE,
  CONVENIO_PROMO_SUBTITLE,
  CONVENIO_PROMO_TITLE,
  getConvenioTelHref,
  getConvenioWhatsappHref,
} from "../../utils/convenioOwnerContact";

type AttendanceLocation = {
  id: number;
  name: string;
  address: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  is_default: boolean;
};

const ProfessionalProfilePage: React.FC = () => {
  const { user, refreshSession } = useAuth();
  const location = useLocation();
  const [profileTab, setProfileTab] = useState<"dados" | "convenio">("dados");
  const [locations, setLocations] = useState<AttendanceLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isAgendaOnlyProfile = user?.professionalType === "agenda_only";
  const convenioWhatsappHref = getConvenioWhatsappHref();
  const convenioTelHref = getConvenioTelHref();
  const showDadosSection = !isAgendaOnlyProfile || profileTab === "dados";

  // Profile form state
  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    phone: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // Location modal state
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [locationModalMode, setLocationModalMode] = useState<"create" | "edit">(
    "create"
  );
  const [selectedLocation, setSelectedLocation] =
    useState<AttendanceLocation | null>(null);

  // Location form state
  const [locationData, setLocationData] = useState({
    name: "",
    address: "",
    address_number: "",
    address_complement: "",
    neighborhood: "",
    city: "",
    state: "",
    zip_code: "",
    phone: "",
    is_default: false,
  });

  const [specialtyDraft, setSpecialtyDraft] = useState<SpecialtyCode | "">("");
  const [specialtySaving, setSpecialtySaving] = useState(false);
  const [specialtyFeaturesOn, setSpecialtyFeaturesOn] = useState(true);

  // Password visibility
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [locationToDelete, setLocationToDelete] =
    useState<AttendanceLocation | null>(null);


  // Clinic logo state
  const [clinicLogoUrl, setClinicLogoUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isDeletingLogo, setIsDeletingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const code = user?.primarySpecialtyCode;
    if (code && SPECIALTY_CODES.includes(code as SpecialtyCode)) {
      setSpecialtyDraft(code as SpecialtyCode);
    } else {
      setSpecialtyDraft("");
    }
  }, [user?.primarySpecialtyCode]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth(
          `${getApiUrl()}/api/professional/features`
        );
        if (res.ok) {
          const d = await res.json();
          setSpecialtyFeaturesOn(d.specialtyMedicalRecords !== false);
        }
      } catch {
        setSpecialtyFeaturesOn(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isAgendaOnlyProfile) return;
    if (location.hash === "#convenio") {
      setProfileTab("convenio");
    }
  }, [location.hash, isAgendaOnlyProfile]);

  const saveSpecialty = async () => {
    if (!specialtyDraft) {
      setError("Selecione uma especialidade.");
      return;
    }
    setError("");
    setSuccess("");
    setSpecialtySaving(true);
    try {
      const res = await fetchWithAuth(
        `${getApiUrl()}/api/professional/profile/specialty`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ primary_specialty_code: specialtyDraft }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Erro ao atualizar especialidade");
      }
      setSuccess(
        data.message ||
          "Especialidade atualizada. Novos prontuários usarão este perfil."
      );
      await refreshSession();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Erro ao atualizar especialidade"
      );
    } finally {
      setSpecialtySaving(false);
    }
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const apiUrl = getApiUrl();

      // Fetch user profile
      const actorId = getProfessionalActorId(user);
      const userResponse = await fetchWithAuth(`${apiUrl}/api/users/${actorId}`);

      if (userResponse.ok) {
        const userData = await userResponse.json();
        setProfileData((prev) => ({
          ...prev,
          name: userData.name || "",
          email: userData.email || "",
          phone: userData.phone || "",
        }));
      }

      // Fetch attendance locations
      const locationsResponse = await fetchWithAuth(
        `${apiUrl}/api/attendance-locations`
      );

      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        setLocations(locationsData);
      }

      // Fetch clinic logo
      const logoResponse = await fetchWithAuth(
        `${apiUrl}/api/professionals/${actorId}/clinic-logo`
      );
      if (logoResponse.ok) {
        const logoData = await logoResponse.json();
        setClinicLogoUrl(logoData.clinic_logo_url ?? null);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setError("Não foi possível carregar os dados");
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validate password change
    if (profileData.newPassword) {
      if (!profileData.currentPassword) {
        setError("Senha atual é obrigatória para alterar a senha");
        return;
      }
      if (profileData.newPassword !== profileData.confirmPassword) {
        setError("Nova senha e confirmação não coincidem");
        return;
      }
      if (profileData.newPassword.length < 6) {
        setError("Nova senha deve ter pelo menos 6 caracteres");
        return;
      }
    }

    try {
      const apiUrl = getApiUrl();
      const actorId = getProfessionalActorId(user);
      if (!actorId) {
        setError("Não foi possível identificar o profissional.");
        return;
      }

      const updateData: any = {
        name: profileData.name,
        email: profileData.email,
        phone: profileData.phone,
      };

      if (profileData.newPassword) {
        updateData.currentPassword = profileData.currentPassword;
        updateData.newPassword = profileData.newPassword;
      }

      const response = await fetchWithAuth(`${apiUrl}/api/users/${actorId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao atualizar perfil");
      }

      setSuccess("Perfil atualizado com sucesso!");

      // Clear password fields
      setProfileData((prev) => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Erro ao atualizar perfil"
      );
    }
  };

  const openLocationModal = (
    mode: "create" | "edit",
    location?: AttendanceLocation
  ) => {
    setLocationModalMode(mode);

    if (mode === "edit" && location) {
      setLocationData({
        name: location.name,
        address: location.address || "",
        address_number: location.address_number || "",
        address_complement: location.address_complement || "",
        neighborhood: location.neighborhood || "",
        city: location.city || "",
        state: location.state || "",
        zip_code: location.zip_code || "",
        phone: location.phone || "",
        is_default: location.is_default,
      });
      setSelectedLocation(location);
    } else {
      setLocationData({
        name: "",
        address: "",
        address_number: "",
        address_complement: "",
        neighborhood: "",
        city: "",
        state: "",
        zip_code: "",
        phone: "",
        is_default: false,
      });
      setSelectedLocation(null);
    }

    setIsLocationModalOpen(true);
  };

  const closeLocationModal = () => {
    setIsLocationModalOpen(false);
    setError("");
    setSuccess("");
  };

  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      const apiUrl = getApiUrl();

      const url =
        locationModalMode === "create"
          ? `${apiUrl}/api/attendance-locations`
          : `${apiUrl}/api/attendance-locations/${selectedLocation?.id}`;

      const method = locationModalMode === "create" ? "POST" : "PUT";

      const response = await fetchWithAuth(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(locationData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao salvar local");
      }

      setSuccess(
        locationModalMode === "create"
          ? "Local criado com sucesso!"
          : "Local atualizado com sucesso!"
      );
      await fetchData();

      setTimeout(() => {
        closeLocationModal();
      }, 1500);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Erro ao salvar local");
    }
  };

  const confirmDeleteLocation = (location: AttendanceLocation) => {
    setLocationToDelete(location);
    setShowDeleteConfirm(true);
  };

  const cancelDeleteLocation = () => {
    setLocationToDelete(null);
    setShowDeleteConfirm(false);
  };

  const deleteLocation = async () => {
    if (!locationToDelete) return;

    try {
      const apiUrl = getApiUrl();

      const response = await fetchWithAuth(
        `${apiUrl}/api/attendance-locations/${locationToDelete.id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao excluir local");
      }

      await fetchData();
      setSuccess("Local excluído com sucesso!");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Erro ao excluir local"
      );
    } finally {
      setLocationToDelete(null);
      setShowDeleteConfirm(false);
    }
  };


  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setSuccess("");
    setIsUploadingLogo(true);
    try {
      const apiUrl = getApiUrl();
      const actorId = getProfessionalActorId(user);
      const formData = new FormData();
      formData.append("clinic_logo", file);
      const res = await fetchWithAuth(
        `${apiUrl}/api/professionals/${actorId}/clinic-logo`,
        { method: "POST", body: formData }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao salvar logo");
      setClinicLogoUrl(data.clinic_logo_url);
      setSuccess("Logo salva com sucesso!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar logo");
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleLogoDelete = async () => {
    setError("");
    setSuccess("");
    setIsDeletingLogo(true);
    try {
      const apiUrl = getApiUrl();
      const actorId = getProfessionalActorId(user);
      const res = await fetchWithAuth(
        `${apiUrl}/api/professionals/${actorId}/clinic-logo`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Erro ao remover logo");
      }
      setClinicLogoUrl(null);
      setSuccess("Logo removida.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover logo");
    } finally {
      setIsDeletingLogo(false);
    }
  };

  const formatZipCode = (value: string) => {
    const numericValue = value.replace(/\D/g, "");
    const limitedValue = numericValue.slice(0, 8);
    return limitedValue.replace(/(\d{5})(\d{3})/, "$1-$2");
  };

  const formatPhone = (value: string) => {
    const numericValue = value.replace(/\D/g, "");
    const limitedValue = numericValue.slice(0, 11);

    if (limitedValue.length <= 10) {
      return limitedValue.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    } else {
      return limitedValue.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Perfil Profissional
        </h1>
        <p className="text-gray-600">
          Gerencie suas informações pessoais e locais de atendimento
        </p>
      </div>

      {isAgendaOnlyProfile && (
        <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 pb-1">
          <button
            type="button"
            onClick={() => {
              setProfileTab("dados");
              window.history.replaceState(null, "", location.pathname);
            }}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
              profileTab === "dados"
                ? "border-red-600 text-red-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Dados e locais
          </button>
          <button
            type="button"
            onClick={() => {
              setProfileTab("convenio");
              window.history.replaceState(
                null,
                "",
                `${location.pathname}#convenio`
              );
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
              profileTab === "convenio"
                ? "border-red-600 text-red-600 bg-red-50/50"
                : "border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            <Briefcase className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            <span>Convênio Quiro Ferreira</span>
            <span className="hidden sm:inline rounded px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-600">
              Rede
            </span>
          </button>
        </div>
      )}

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

      {showDadosSection && specialtyFeaturesOn && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6 max-w-3xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Área de atuação (prontuários)
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Define os campos do modelo de prontuário para{" "}
            <strong>novos</strong> registros. Prontuários já existentes não são
            alterados.
          </p>
          {!user?.primarySpecialtyCode ? (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
              <p className="mb-2">
                Você ainda não definiu sua especialidade. Sem isso, não é
                possível criar novos prontuários no modelo específico.
              </p>
              <Link
                to="/professional/onboarding"
                className="font-medium text-red-700 hover:underline"
              >
                Completar cadastro de especialidade
              </Link>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Especialidade principal
                </label>
                <select
                  value={specialtyDraft}
                  onChange={(e) =>
                    setSpecialtyDraft(e.target.value as SpecialtyCode | "")
                  }
                  className="input w-full"
                >
                  <option value="">Selecione…</option>
                  {SPECIALTY_CODES.map((c) => (
                    <option key={c} value={c}>
                      {getSpecialtyLabelPt(c)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void saveSpecialty()}
                disabled={
                  specialtySaving ||
                  !specialtyDraft ||
                  specialtyDraft === user.primarySpecialtyCode
                }
                className="btn btn-primary px-6 disabled:opacity-50"
              >
                {specialtySaving ? "Salvando…" : "Salvar especialidade"}
              </button>
            </div>
          )}
        </div>
      )}

      {isAgendaOnlyProfile && profileTab === "convenio" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 md:p-8 max-w-3xl">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {CONVENIO_PROMO_TITLE}
          </h2>
          <p className="text-gray-600 mb-4">{CONVENIO_PROMO_SUBTITLE}</p>
          <p className="text-gray-600 mb-4">
            Você já usa a agenda digital para organizar atendimentos particulares.
            Na rede credenciada, o mesmo fluxo ganha visibilidade para quem tem o
            cartão e busca profissionais pelo sistema.
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 mb-6">
            <li>
              Perfil disponível para titulares e dependentes que agendam pela
              plataforma
            </li>
            <li>
              Agenda e comunicação alinhadas ao que a rede já utiliza no dia a dia
            </li>
            <li>
              Transparência em repasses e apoio da equipe na entrada e dúvidas
              operacionais
            </li>
          </ul>
          <p className="text-gray-700 font-medium mb-4">
            {CONVENIO_PROMO_CTA_LINE}
          </p>
          <p className="text-sm text-gray-600 mb-4">
            Telefone:{" "}
            <a
              href={convenioTelHref}
              className="font-medium text-red-700 hover:underline"
            >
              {CONVENIO_OWNER_DISPLAY_PHONE}
            </a>
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={convenioWhatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-3 text-white font-medium hover:bg-green-700 transition-colors"
            >
              <MessageCircle className="h-5 w-5" />
              Falar no WhatsApp
            </a>
            <a
              href={convenioTelHref}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 text-gray-800 font-medium hover:bg-gray-50 transition-colors"
            >
              <Phone className="h-5 w-5" />
              Ligar
            </a>
          </div>
        </div>
      )}

      {showDadosSection && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Information */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center mb-6">
              <User className="h-6 w-6 text-red-600 mr-2" />
              <h2 className="text-xl font-semibold">Informações Pessoais</h2>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome Completo
                </label>
                <input
                  type="text"
                  value={profileData.name}
                  onChange={(e) =>
                    setProfileData((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={profileData.email}
                  onChange={(e) =>
                    setProfileData((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefone
                </label>
                <input
                  type="text"
                  value={profileData.phone}
                  onChange={(e) =>
                    setProfileData((prev) => ({
                      ...prev,
                      phone: formatPhone(e.target.value),
                    }))
                  }
                  className="input"
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Alterar Senha
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Senha Atual
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        value={profileData.currentPassword}
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            currentPassword: e.target.value,
                          }))
                        }
                        className="input pr-10"
                      />
                      <button
                        type="button"
                        title={
                          showCurrentPassword ? "Ocultar senha" : "Mostrar senha"
                        }
                        aria-label={
                          showCurrentPassword ? "Ocultar senha" : "Mostrar senha"
                        }
                        onClick={() =>
                          setShowCurrentPassword(!showCurrentPassword)
                        }
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 z-10 cursor-pointer"
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nova Senha
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={profileData.newPassword}
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            newPassword: e.target.value,
                          }))
                        }
                        className="input pr-10"
                        minLength={6}
                      />
                      <button
                        type="button"
                        title={showNewPassword ? "Ocultar senha" : "Mostrar senha"}
                        aria-label={
                          showNewPassword ? "Ocultar senha" : "Mostrar senha"
                        }
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 z-10 cursor-pointer"
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirmar Nova Senha
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={profileData.confirmPassword}
                        onChange={(e) =>
                          setProfileData((prev) => ({
                            ...prev,
                            confirmPassword: e.target.value,
                          }))
                        }
                        className="input pr-10"
                        minLength={6}
                      />
                      <button
                        type="button"
                        title={
                          showConfirmPassword ? "Ocultar senha" : "Mostrar senha"
                        }
                        aria-label={
                          showConfirmPassword ? "Ocultar senha" : "Mostrar senha"
                        }
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 z-10 cursor-pointer"
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
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  className="btn btn-primary flex items-center"
                >
                  <Save className="h-5 w-5 mr-2" />
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>

          {/* Clinic Logo Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center">
                <FileImage className="h-6 w-6 text-red-600 mr-2" />
                <h2 className="text-xl font-semibold">Logo da Clínica</h2>
              </div>
              <div className="flex items-center gap-2">
                {clinicLogoUrl && (
                  <button
                    type="button"
                    onClick={handleLogoDelete}
                    disabled={isDeletingLogo}
                    className="btn btn-secondary flex items-center text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4 mr-1" />
                    {isDeletingLogo ? "Removendo..." : "Remover"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="btn btn-primary flex items-center"
                >
                  <Upload className="h-5 w-5 mr-2" />
                  {isUploadingLogo ? "Enviando..." : clinicLogoUrl ? "Alterar Logo" : "Adicionar Logo"}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </div>
            </div>

            {clinicLogoUrl ? (
              <div className="text-center">
                <div className="bg-white border border-gray-200 rounded-lg p-6 inline-block w-full max-w-md mx-auto">
                  <img
                    src={clinicLogoUrl}
                    alt="Logo da clínica"
                    className="mx-auto block object-contain max-h-24 max-w-xs"
                  />
                </div>
                <p className="text-sm text-gray-600 mt-3">
                  Esta logo será exibida automaticamente no cabeçalho de todos os
                  documentos e prontuários gerados.
                </p>
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <FileImage className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Nenhuma logo cadastrada
                </h3>
                <p className="text-gray-600 mb-4">
                  Adicione a logo da sua clínica para que apareça automaticamente
                  no cabeçalho dos documentos gerados.
                </p>
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="btn btn-primary inline-flex items-center"
                >
                  <Upload className="h-5 w-5 mr-2" />
                  Adicionar Logo
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Attendance Locations */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <MapPin className="h-6 w-6 text-red-600 mr-2" />
              <h2 className="text-xl font-semibold">Locais de Atendimento</h2>
            </div>

            <button
              onClick={() => openLocationModal("create")}
              className="btn btn-primary flex items-center"
            >
              <Plus className="h-5 w-5 mr-2" />
              Novo Local
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Carregando...</p>
            </div>
          ) : locations.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhum local cadastrado
              </h3>
              <p className="text-gray-600 mb-4">
                Adicione seus locais de atendimento
              </p>
              <button
                onClick={() => openLocationModal("create")}
                className="btn btn-primary inline-flex items-center"
              >
                <Plus className="h-5 w-5 mr-2" />
                Adicionar Primeiro Local
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {locations.map((location) => (
                <div
                  key={location.id}
                  className={`p-4 rounded-lg border-2 transition-colors ${
                    location.is_default
                      ? "border-red-200 bg-red-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <h3 className="font-semibold text-gray-900">
                          {location.name}
                        </h3>
                        {location.is_default && (
                          <span className="ml-2 px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                            Padrão
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-gray-600 space-y-1">
                        {location.address && (
                          <p>
                            {location.address}
                            {location.address_number &&
                              `, ${location.address_number}`}
                            {location.address_complement &&
                              `, ${location.address_complement}`}
                          </p>
                        )}
                        {location.neighborhood && location.city && (
                          <p>
                            {location.neighborhood}, {location.city} -{" "}
                            {location.state}
                          </p>
                        )}
                        {location.zip_code && (
                          <p>CEP: {formatZipCode(location.zip_code)}</p>
                        )}
                        {location.phone && (
                          <p>Telefone: {formatPhone(location.phone)}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => openLocationModal("edit", location)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Editar"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => confirmDeleteLocation(location)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Location form modal */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold">
                {locationModalMode === "create"
                  ? "Novo Local de Atendimento"
                  : "Editar Local de Atendimento"}
              </h2>
            </div>

            <form onSubmit={handleLocationSubmit} className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome do Local *
                  </label>
                  <input
                    type="text"
                    value={locationData.name}
                    onChange={(e) =>
                      setLocationData((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    className="input"
                    placeholder="Ex: Clínica Central"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CEP
                    </label>
                    <input
                      type="text"
                      value={locationData.zip_code}
                      onChange={(e) =>
                        setLocationData((prev) => ({
                          ...prev,
                          zip_code: e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 8),
                        }))
                      }
                      className="input"
                      placeholder="00000-000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Endereço
                    </label>
                    <input
                      type="text"
                      value={locationData.address}
                      onChange={(e) =>
                        setLocationData((prev) => ({
                          ...prev,
                          address: e.target.value,
                        }))
                      }
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Número
                    </label>
                    <input
                      type="text"
                      value={locationData.address_number}
                      onChange={(e) =>
                        setLocationData((prev) => ({
                          ...prev,
                          address_number: e.target.value,
                        }))
                      }
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Complemento
                    </label>
                    <input
                      type="text"
                      value={locationData.address_complement}
                      onChange={(e) =>
                        setLocationData((prev) => ({
                          ...prev,
                          address_complement: e.target.value,
                        }))
                      }
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bairro
                    </label>
                    <input
                      type="text"
                      value={locationData.neighborhood}
                      onChange={(e) =>
                        setLocationData((prev) => ({
                          ...prev,
                          neighborhood: e.target.value,
                        }))
                      }
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Cidade
                    </label>
                    <input
                      type="text"
                      value={locationData.city}
                      onChange={(e) =>
                        setLocationData((prev) => ({
                          ...prev,
                          city: e.target.value,
                        }))
                      }
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estado
                    </label>
                    <select
                      value={locationData.state}
                      onChange={(e) =>
                        setLocationData((prev) => ({
                          ...prev,
                          state: e.target.value,
                        }))
                      }
                      className="input"
                    >
                      <option value="">Selecione...</option>
                      <option value="AC">Acre</option>
                      <option value="AL">Alagoas</option>
                      <option value="AP">Amapá</option>
                      <option value="AM">Amazonas</option>
                      <option value="BA">Bahia</option>
                      <option value="CE">Ceará</option>
                      <option value="DF">Distrito Federal</option>
                      <option value="ES">Espírito Santo</option>
                      <option value="GO">Goiás</option>
                      <option value="MA">Maranhão</option>
                      <option value="MT">Mato Grosso</option>
                      <option value="MS">Mato Grosso do Sul</option>
                      <option value="MG">Minas Gerais</option>
                      <option value="PA">Pará</option>
                      <option value="PB">Paraíba</option>
                      <option value="PR">Paraná</option>
                      <option value="PE">Pernambuco</option>
                      <option value="PI">Piauí</option>
                      <option value="RJ">Rio de Janeiro</option>
                      <option value="RN">Rio Grande do Norte</option>
                      <option value="RS">Rio Grande do Sul</option>
                      <option value="RO">Rondônia</option>
                      <option value="RR">Roraima</option>
                      <option value="SC">Santa Catarina</option>
                      <option value="SP">São Paulo</option>
                      <option value="SE">Sergipe</option>
                      <option value="TO">Tocantins</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Registro Profissional
                    </label>
                    <input
                      type="text"
                      value={locationData.phone}
                      onChange={(e) =>
                        setLocationData((prev) => ({
                          ...prev,
                          phone: formatPhone(e.target.value),
                        }))
                      }
                      className="input"
                      placeholder="Ex: CREFITO 12345/GO, CRM 12345/GO"
                    />
                  </div>
                </div>

                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={locationData.is_default}
                      onChange={(e) =>
                        setLocationData((prev) => ({
                          ...prev,
                          is_default: e.target.checked,
                        }))
                      }
                      className="rounded border-gray-300 text-red-600 shadow-sm focus:border-red-300 focus:ring focus:ring-red-200 focus:ring-opacity-50"
                    />
                    <span className="ml-2 text-sm text-gray-600">
                      Definir como local padrão
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeLocationModal}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {locationModalMode === "create"
                    ? "Criar Local"
                    : "Salvar Alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && locationToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Confirmar Exclusão</h2>

            <p className="mb-6">
              Tem certeza que deseja excluir o local{" "}
              <strong>{locationToDelete.name}</strong>? Esta ação não pode ser
              desfeita.
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelDeleteLocation}
                className="btn btn-secondary flex items-center"
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </button>
              <button
                onClick={deleteLocation}
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

export default ProfessionalProfilePage;
