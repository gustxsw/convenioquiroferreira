import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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
  login: (cpf: string, password: string) => Promise<{ user: User; needsRoleSelection: boolean }>;
  selectRole: (userId: number, role: string) => Promise<void>;
  switchRole: (role: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Get API URL
  const getApiUrl = () => {
    if (window.location.hostname === 'www.cartaoquiroferreira.com.br' || 
        window.location.hostname === 'cartaoquiroferreira.com.br') {
      return 'https://www.cartaoquiroferreira.com.br';
    }
    return 'http://localhost:3001';
  };

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('user');
        
        if (token && userData) {
          const parsedUser = JSON.parse(userData);
          console.log('🔄 Restored user from localStorage:', parsedUser);
          setUser(parsedUser);
        }
      } catch (error) {
        console.error('❌ Auth check error:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuthStatus();
  }, []);

  const login = async (cpf: string, password: string): Promise<{ user: User; needsRoleSelection: boolean }> => {
    try {
      setIsLoading(true);
      
      const apiUrl = getApiUrl();
      console.log('🔄 Making login request to:', `${apiUrl}/api/auth/login`);
      
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cpf, password }),
        credentials: 'include',
      });

      console.log('📡 Login response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Credenciais inválidas');
      }

      const data = await response.json();
      console.log('✅ Login successful:', data);
      
      const userData = data.user;
      const needsRoleSelection = userData.roles && userData.roles.length > 1;
      
      console.log('🎯 User roles:', userData.roles);
      console.log('🎯 Needs role selection:', needsRoleSelection);
      
      return { user: userData, needsRoleSelection };
    } catch (error) {
      console.error('❌ Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const selectRole = async (userId: number, role: string) => {
    try {
      setIsLoading(true);
      
      const apiUrl = getApiUrl();
      console.log('🎯 Selecting role:', { userId, role });
      
      const response = await fetch(`${apiUrl}/api/auth/select-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, role }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao selecionar role');
      }

      const data = await response.json();
      console.log('✅ Role selected:', data);
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      setUser(data.user);

      // Navigate based on role - IMEDIATO
      console.log('🚀 Navigating to role:', role);
      
      if (role === 'client') {
        console.log('🚀 Redirecting to /client');
        navigate('/client', { replace: true });
      } else if (role === 'professional') {
        console.log('🚀 Redirecting to /professional');
        navigate('/professional', { replace: true });
      } else if (role === 'admin') {
        console.log('🚀 Redirecting to /admin');
        navigate('/admin', { replace: true });
      }
      
    } catch (error) {
      console.error('❌ Role selection error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const switchRole = async (role: string) => {
    try {
      setIsLoading(true);
      
      const apiUrl = getApiUrl();
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${apiUrl}/api/auth/switch-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Erro ao trocar role');
      }

      const data = await response.json();
      console.log('✅ Role switched:', data);
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      setUser(data.user);

      // Navigate based on role
      if (role === 'client') {
        navigate('/client');
      } else if (role === 'professional') {
        navigate('/professional');
      } else if (role === 'admin') {
        navigate('/admin');
      }
    } catch (error) {
      console.error('❌ Role switch error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      
      const apiUrl = getApiUrl();
      
      await fetch(`${apiUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('tempUser'); // LIMPAR DADOS TEMPORÁRIOS
      
      setUser(null);
      navigate('/login');
    } catch (error) {
      console.error('❌ Logout error:', error);
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
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};