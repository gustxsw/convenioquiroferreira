import React, { useState, useEffect } from "react";
import { Phone, MapPin, Briefcase, Mail, Calendar } from "lucide-react";

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
};

const ProfessionalsPage: React.FC = () => {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Get API URL with fallback
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
    const fetchProfessionals = async () => {
      try {
        setIsLoading(true);
        setError("");
        
        const token = localStorage.getItem("token");
        const apiUrl = getApiUrl();

        console.log("Fetching professionals from:", `${apiUrl}/api/professionals`);

        const response = await fetch(`${apiUrl}/api/professionals`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        console.log("Professionals response status:", response.status);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Falha ao carregar profissionais");
        }

        const data = await response.json();
        console.log("Professionals data received:", data);
        
        setProfessionals(data);
      } catch (error) {
        console.error("Error fetching professionals:", error);
        setError("Não foi possível carregar a lista de profissionais");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfessionals();
  }, []);

  const formatPhone = (phone: string) => {
    if (!phone) return "Não informado";
    
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
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
    
    return parts.length > 0 ? parts.join(", ") : "Endereço não informado";
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Nossos Profissionais
        </h1>
        <p className="text-gray-600">
          Conheça nossa equipe de profissionais qualificados
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 flex items-center">
          <Calendar className="h-5 w-5 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando profissionais...</p>
        </div>
      ) : professionals.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Briefcase className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhum profissional encontrado
          </h3>
          <p className="text-gray-600">
            Não há profissionais cadastrados no momento.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {professionals.map((professional) => (
            <div
              key={professional.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-all duration-200 hover:scale-105"
            >
              <div className="p-6">
                {/* Header */}
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Briefcase className="h-8 w-8 text-red-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-1">
                    {professional.name}
                  </h2>
                  {professional.category_name && (
                    <p className="text-sm text-red-600 font-medium">
                      {professional.category_name}
                    </p>
                  )}
                </div>

                {/* Contact Information */}
                <div className="space-y-3 mb-6">
                  {professional.phone && (
                    <div className="flex items-center">
                      <Phone className="h-4 w-4 text-gray-400 mr-3 flex-shrink-0" />
                      <span className="text-sm text-gray-600">
                        {formatPhone(professional.phone)}
                      </span>
                    </div>
                  )}

                  {professional.email && (
                    <div className="flex items-center">
                      <Mail className="h-4 w-4 text-gray-400 mr-3 flex-shrink-0" />
                      <span className="text-sm text-gray-600 truncate">
                        {professional.email}
                      </span>
                    </div>
                  )}

                  <div className="flex items-start">
                    <MapPin className="h-4 w-4 text-gray-400 mr-3 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-600 leading-relaxed">
                      {formatAddress(professional)}
                    </span>
                  </div>
                </div>

                {/* Action Button */}
                {professional.phone && (
                  <a
                    href={`tel:${professional.phone.replace(/\D/g, '')}`}
                    className="block w-full text-center bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 transition-colors duration-200 font-medium"
                  >
                    <Phone className="h-4 w-4 inline mr-2" />
                    Ligar
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contact Information */}
      <div className="mt-12 bg-red-50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-red-900 mb-3">
          Informações de Contato
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center">
            <Phone className="h-4 w-4 text-red-600 mr-2" />
            <span className="text-red-800">
              <strong>Telefone:</strong> (64) 98121-0313
            </span>
          </div>
          <div className="flex items-center">
            <Calendar className="h-4 w-4 text-red-600 mr-2" />
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