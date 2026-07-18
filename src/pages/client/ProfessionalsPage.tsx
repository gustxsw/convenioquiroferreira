"use client";

import type React from "react";
import { useState, useEffect } from "react";
import {
  Phone,
  MapPin,
  Briefcase,
  Mail,
  Calendar,
  X,
  Filter,
  MessageCircle,
  Instagram,
  Facebook,
  ChevronDown,
} from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";

type Professional = {
  id: number;
  name: string;
  email: string;
  phone: string;
  roles: string[];
  address: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
  category_name: string;
  photo_url?: string;
  bio?: string;
  social_instagram?: string;
  social_facebook?: string;
};

const buildWhatsappUrl = (phone: string) =>
  `https://wa.me/55${(phone || "").replace(/\D/g, "")}`;

const buildSocialUrl = (raw: string | undefined, domain: string) => {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v
    .replace(/^@/, "")
    .replace(new RegExp(`^(www\\.)?${domain}/`, "i"), "")
    .replace(/^\//, "");
  return `https://${domain}/${handle}`;
};

const formatAddress = (professional: Professional) => {
  const parts = [
    professional.address,
    professional.address_number,
    professional.address_complement,
    professional.neighborhood,
    professional.city,
    professional.state,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "";
};

// Card individual de profissional
const ProfessionalCard: React.FC<{ professional: Professional }> = ({
  professional,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [photoModal, setPhotoModal] = useState(false);

  const instagramUrl = buildSocialUrl(professional.social_instagram, "instagram.com");
  const facebookUrl = buildSocialUrl(professional.social_facebook, "facebook.com");
  const address = formatAddress(professional);
  const hasSocial = !!(professional.phone || instagramUrl || facebookUrl);
  const hasDetails = !!(professional.email || address || professional.bio);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
        <div className="p-5">
          {/* Cabeçalho: foto + nome + especialidade */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 flex-shrink-0">
              {professional.photo_url ? (
                <button
                  onClick={() => setPhotoModal(true)}
                  className="w-14 h-14 rounded-full overflow-hidden border-2 border-red-100 hover:border-red-300 transition-colors cursor-pointer"
                  title="Clique para ampliar"
                >
                  <img
                    src={professional.photo_url}
                    alt={`Foto de ${professional.name}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </button>
              ) : (
                <div className="w-14 h-14 rounded-full bg-red-50 border-2 border-red-100 flex items-center justify-center">
                  <Briefcase className="h-6 w-6 text-red-400" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900 leading-tight">
                {professional.name}
              </h2>
              {professional.category_name && (
                <p className="text-sm text-red-600 font-medium mt-0.5">
                  {professional.category_name}
                </p>
              )}
            </div>
          </div>

          {/* Redes sociais + botão ver mais */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {professional.phone && (
                <a
                  href={buildWhatsappUrl(professional.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="WhatsApp"
                  className="w-9 h-9 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white transition-colors shadow-sm"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
              {instagramUrl && (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Instagram"
                  className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 hover:opacity-90 flex items-center justify-center text-white transition-opacity shadow-sm"
                >
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {facebookUrl && (
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Facebook"
                  className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white transition-colors shadow-sm"
                >
                  <Facebook className="h-4 w-4" />
                </a>
              )}
              {!hasSocial && (
                <span className="text-xs text-gray-400">Sem redes sociais</span>
              )}
            </div>

            {hasDetails && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
              >
                {expanded ? "Ver menos" : "Ver mais"}
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    expanded ? "rotate-180" : ""
                  }`}
                />
              </button>
            )}
          </div>

          {/* Detalhes expansíveis */}
          {expanded && hasDetails && (
            <div className="mt-4 pt-4 border-t border-gray-100 space-y-2.5">
              {professional.email && (
                <div className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-600 truncate">
                    {professional.email}
                  </span>
                </div>
              )}
              {address && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600 leading-relaxed">
                    {address}
                  </span>
                </div>
              )}
              {professional.bio && (
                <p className="text-sm text-gray-500 leading-relaxed italic border-l-2 border-red-100 pl-3">
                  {professional.bio}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal foto */}
      {photoModal && professional.photo_url && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
          onClick={() => setPhotoModal(false)}
        >
          <div
            className="relative max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPhotoModal(false)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
            <p className="text-white text-center font-medium mb-3">
              {professional.name}
            </p>
            <img
              src={professional.photo_url}
              alt={`Foto de ${professional.name}`}
              className="w-full rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
};

// Página principal
const ProfessionalsPage: React.FC = () => {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [filteredProfessionals, setFilteredProfessionals] = useState<Professional[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchProfessionals = async () => {
      try {
        setIsLoading(true);
        setError("");
        const response = await fetchWithAuth(`${getApiUrl()}/api/professionals`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.message || "Falha ao carregar profissionais");
        }
        const data = await response.json();
        setProfessionals(data);
        const uniqueCities = data
          .map((p: Professional) => p.city)
          .filter((c: string) => c?.trim())
          .filter((c: string, i: number, arr: string[]) => arr.indexOf(c) === i)
          .sort();
        setAvailableCities(uniqueCities);
      } catch {
        setError("Não foi possível carregar a lista de profissionais");
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfessionals();
  }, []);

  useEffect(() => {
    let filtered = professionals;
    if (searchTerm) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.category_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (selectedCity) {
      filtered = filtered.filter((p) => p.city === selectedCity);
    }
    setFilteredProfessionals(filtered);
  }, [professionals, searchTerm, selectedCity]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Nossos Profissionais
        </h1>
        <p className="text-gray-500 text-sm">
          Conheça nossa equipe de profissionais qualificados
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-red-500" />
          <span className="text-sm font-medium text-gray-700">Filtros</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou especialidade..."
            className="input text-sm"
          />
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="input text-sm"
          >
            <option value="">Todas as cidades</option>
            {availableCities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <button
            onClick={() => { setSearchTerm(""); setSelectedCity(""); }}
            className="btn btn-secondary text-sm"
          >
            Limpar
          </button>
        </div>
        {(searchTerm || selectedCity) && (
          <p className="text-xs text-gray-500 mt-3">
            {filteredProfessionals.length} profissional(is) encontrado(s)
            {selectedCity && ` em ${selectedCity}`}
            {searchTerm && ` para "${searchTerm}"`}
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Carregando profissionais...</p>
        </div>
      ) : filteredProfessionals.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl">
          <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {searchTerm || selectedCity
              ? "Nenhum profissional encontrado. Tente ajustar os filtros."
              : "Nenhum profissional cadastrado no momento."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProfessionals.map((professional) => (
            <ProfessionalCard key={professional.id} professional={professional} />
          ))}
        </div>
      )}

      {/* Rodapé de contato */}
      <div className="mt-10 bg-red-50 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-red-900 mb-3">
          Informações de Contato
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-red-500" />
            <span className="text-red-800">
              <strong>Telefone:</strong> (64) 98124-9199
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-red-500" />
            <span className="text-red-800">
              <strong>Horário:</strong> Segunda a Sexta, 8h às 18h
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalsPage;
