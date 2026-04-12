import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Home, Users, FileText, BarChart2, Calendar, UserPlus, CalendarDays, UserCheck, Stethoscope, FileImage, Settings, Clock, DollarSign, Ticket } from 'lucide-react';
import { getSpecialtyLabelPt } from '../config/specialtyTemplates';

type SidebarProps = {
  onItemClick?: () => void;
};

const Sidebar: React.FC<SidebarProps> = ({ onItemClick }) => {
  const { user } = useAuth();
  
  // Navigation links based on user current role
  const getNavLinks = () => {
    if (user?.currentRole === 'client') {
      return [
        { to: '/client', icon: <Home size={20} />, label: 'Início' },
        { to: '/client/professionals', icon: <Users size={20} />, label: 'Profissionais' },
      ];
    } else if (user?.currentRole === 'professional') {
      return [
        { to: '/professional', icon: <Home size={20} />, label: 'Início' },
        { to: '/professional/scheduling', icon: <CalendarDays size={20} />, label: 'Agenda' },
        { to: '/professional/private-patients', icon: <UserCheck size={20} />, label: 'Pacientes Particulares' },
        { to: '/professional/services', icon: <FileText size={20} />, label: 'Meus Serviços' },
        { to: '/professional/medical-records', icon: <Stethoscope size={20} />, label: 'Prontuários' },
        { to: '/professional/documents', icon: <FileImage size={20} />, label: 'Documentos' },
        { to: '/professional/reports', icon: <BarChart2 size={20} />, label: 'Relatórios' },
        { to: '/professional/profile', icon: <Settings size={20} />, label: 'Perfil' },
      ];
    } else if (user?.currentRole === 'admin') {
      return [
        { to: '/admin', icon: <Home size={20} />, label: 'Início' },
        { to: '/admin/users', icon: <Users size={20} />, label: 'Usuários' },
        { to: '/admin/scheduling-access', icon: <Clock size={20} />, label: 'Acesso à Agenda' },
        { to: '/admin/affiliates', icon: <DollarSign size={20} />, label: 'Afiliados' },
        { to: '/admin/coupons', icon: <Ticket size={20} />, label: 'Cupons' },
        { to: '/admin/reports', icon: <BarChart2 size={20} />, label: 'Relatórios' },
      ];
    } else if (user?.currentRole === 'vendedor') {
      return [
        { to: '/affiliate', icon: <Home size={20} />, label: 'Painel' },
      ];
    } else if (user?.currentRole === 'financeiro_agenda') {
      return [
        { to: '/financeiro/agenda', icon: <DollarSign size={20} />, label: 'Financeiro Agenda' },
      ];
    }
    
    return [];
  };
  
  const navLinks = getNavLinks();
  
  return (
    <aside className="h-full">
      <div className="p-4">
        {user?.currentRole === 'professional' &&
          user.primarySpecialtyCode &&
          user.onboardingStatus === 'completed' && (
            <div className="mb-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-900">
              <span className="font-medium text-red-800">Perfil ativo: </span>
              {getSpecialtyLabelPt(user.primarySpecialtyCode)}
              <NavLink
                to="/professional/profile"
                className="mt-1 block text-red-600 hover:underline"
                onClick={onItemClick}
              >
                Alterar em Perfil
              </NavLink>
            </div>
          )}
        <div className="pt-4">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onItemClick}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 mb-2 rounded-md transition-colors ${
                  isActive
                    ? 'bg-red-50 text-red-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              {link.icon}
              <span className="ml-3">{link.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;