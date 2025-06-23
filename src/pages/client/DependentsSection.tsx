import React, { useState, useEffect } from 'react';
import { UserPlus, Edit, Trash2, User, Check, X } from 'lucide-react';

type Dependent = {
  id: number;
  name: string;
  cpf: string;
  birth_date: string;
  created_at: string;
};

type DependentsSectionProps = {
  clientId: number;
};

const DependentsSection: React.FC<DependentsSectionProps> = ({ clientId }) => {
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedDependent, setSelectedDependent] = useState<Dependent | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  
  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dependentToDelete, setDependentToDelete] = useState<Dependent | null>(null);

  // Get API URL with fallback
  const getApiUrl = () => {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL;
    }
    
    if (window.location.hostname === 'cartaoquiroferreira.com.br' || 
        window.location.hostname === 'www.cartaoquiroferreira.com.br') {
      return 'https://convenioquiroferreira.onrender.com';
    }
    
    return 'http://localhost:3001';
  };
  
  useEffect(() => {
    fetchDependents();
  }, [clientId]);
  
  const fetchDependents = async () => {
    try {
      setIsLoading(true);
      setError('');
      
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();
      
      console.log('Fetching dependents from:', apiUrl);
      
      const response = await fetch(`${apiUrl}/api/dependents/${clientId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Falha ao carregar dependentes');
      }
      
      const data = await response.json();
      setDependents(data);
    } catch (error) {
      console.error('Error fetching dependents:', error);
      setError('Não foi possível carregar os dependentes');
    } finally {
      setIsLoading(false);
    }
  };
  
  const openCreateModal = () => {
    setModalMode('create');
    setName('');
    setCpf('');
    setBirthDate('');
    setSelectedDependent(null);
    setIsModalOpen(true);
  };
  
  const openEditModal = (dependent: Dependent) => {
    setModalMode('edit');
    setName(dependent.name);
    setCpf(dependent.cpf);
    setBirthDate(dependent.birth_date);
    setSelectedDependent(dependent);
    setIsModalOpen(true);
  };
  
  const closeModal = () => {
    setIsModalOpen(false);
    setSuccess('');
    setError('');
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();
      
      if (modalMode === 'create') {
        // Validate CPF format
        if (!/^\d{11}$/.test(cpf.replace(/\D/g, ''))) {
          setError('CPF deve conter 11 dígitos numéricos');
          return;
        }
        
        // Create dependent
        const response = await fetch(`${apiUrl}/api/dependents`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            name,
            cpf: cpf.replace(/\D/g, ''),
            birth_date: birthDate,
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Falha ao criar dependente');
        }
        
        setSuccess('Dependente adicionado com sucesso!');
      } else if (modalMode === 'edit' && selectedDependent) {
        // Update dependent
        const response = await fetch(`${apiUrl}/api/dependents/${selectedDependent.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            birth_date: birthDate,
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Falha ao atualizar dependente');
        }
        
        setSuccess('Dependente atualizado com sucesso!');
      }
      
      // Refresh dependents list
      await fetchDependents();
      
      // Close modal after short delay
      setTimeout(() => {
        closeModal();
      }, 1500);
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Ocorreu um erro ao processar a solicitação');
      }
    }
  };
  
  const confirmDelete = (dependent: Dependent) => {
    setDependentToDelete(dependent);
    setShowDeleteConfirm(true);
  };
  
  const cancelDelete = () => {
    setDependentToDelete(null);
    setShowDeleteConfirm(false);
  };
  
  const deleteDependent = async () => {
    if (!dependentToDelete) return;
    
    try {
      const token = localStorage.getItem('token');
      const apiUrl = getApiUrl();
      
      const response = await fetch(`${apiUrl}/api/dependents/${dependentToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao excluir dependente');
      }
      
      // Refresh dependents list
      await fetchDependents();
      
      setSuccess('Dependente excluído com sucesso!');
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Ocorreu um erro ao excluir o dependente');
      }
    } finally {
      setDependentToDelete(null);
      setShowDeleteConfirm(false);
    }
  };
  
  const formatCpf = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    const limitedValue = numericValue.slice(0, 11);
    setCpf(limitedValue);
  };
  
  const formattedCpf = (cpfValue: string) => {
    return cpfValue.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };
  
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };
  
  return (
    <div className="card mb-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <User className="h-6 w-6 text-red-600 mr-2" />
          <h2 className="text-xl font-semibold">Dependentes</h2>
        </div>
        
        {dependents.length < 10 && (
          <button
            onClick={openCreateModal}
            className="btn btn-primary flex items-center"
          >
            <UserPlus className="h-5 w-5 mr-2" />
            Adicionar Dependente
          </button>
        )}
      </div>
      
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md mb-4">
          {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-md mb-4">
          {success}
        </div>
      )}
      
      {isLoading ? (
        <div className="text-center py-8">
          <p className="text-gray-600">Carregando dependentes...</p>
        </div>
      ) : dependents.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <p className="text-gray-600">Você ainda não possui dependentes cadastrados.</p>
          <button
            onClick={openCreateModal}
            className="btn btn-primary mt-4 inline-flex items-center"
          >
            <UserPlus className="h-5 w-5 mr-2" />
            Adicionar Dependente
          </button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF</th>
                <th>Data de Nascimento</th>
                <th>Data de Cadastro</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {dependents.map((dependent) => (
                <tr key={dependent.id}>
                  <td className="flex items-center">
                    <User className="h-5 w-5 mr-2 text-gray-500" />
                    {dependent.name}
                  </td>
                  <td>{formattedCpf(dependent.cpf)}</td>
                  <td>{formatDate(dependent.birth_date)}</td>
                  <td>{formatDate(dependent.created_at)}</td>
                  <td>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => openEditModal(dependent)}
                        className="p-1 text-blue-600 hover:text-blue-800"
                        title="Editar"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => confirmDelete(dependent)}
                        className="p-1 text-red-600 hover:text-red-800"
                        title="Excluir"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Dependent form modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {modalMode === 'create' ? 'Adicionar Dependente' : 'Editar Dependente'}
              </h2>
              <button
                onClick={closeModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4">
                {error}
              </div>
            )}
            
            {success && (
              <div className="bg-green-50 text-green-600 p-3 rounded-md mb-4">
                {success}
              </div>
            )}
            
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Nome
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  required
                />
              </div>
              
              {modalMode === 'create' && (
                <div className="mb-4">
                  <label htmlFor="cpf" className="block text-sm font-medium text-gray-700 mb-1">
                    CPF
                  </label>
                  <input
                    id="cpf"
                    type="text"
                    value={cpf ? formattedCpf(cpf) : ''}
                    onChange={(e) => formatCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="input"
                    required
                  />
                </div>
              )}
              
              <div className="mb-6">
                <label htmlFor="birthDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Data de Nascimento
                </label>
                <input
                  id="birthDate"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="input"
                  required
                />
              </div>
              
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-secondary mr-2"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {modalMode === 'create' ? 'Adicionar' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Delete confirmation modal */}
      {showDeleteConfirm && dependentToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Confirmar Exclusão</h2>
            
            <p className="mb-6">
              Tem certeza que deseja excluir o dependente <strong>{dependentToDelete.name}</strong>?
              Esta ação não pode ser desfeita.
            </p>
            
            <div className="flex justify-end">
              <button
                onClick={cancelDelete}
                className="btn btn-secondary mr-2 flex items-center"
              >
                <X className="h-5 w-5 mr-1" />
                Cancelar
              </button>
              <button
                onClick={deleteDependent}
                className="btn bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 flex items-center"
              >
                <Check className="h-5 w-5 mr-1" />
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DependentsSection;