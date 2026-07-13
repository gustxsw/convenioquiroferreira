import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Home, Users, FileText, BarChart2, Calendar, UserPlus, CalendarDays, UserCheck, Stethoscope, FileImage, Settings, Clock, DollarSign, Ticket, MessageCircle, Shield } from 'lucide-react';
import { getSpecialtyLabelPt } from '../config/specialtyTemplates';
import { usePendingCount } from '../hooks/usePendingCount';

type SidebarProps = {
  onItemClick?: () => void;
};

const Sidebar: React.FC<SidebarProps> = ({ onItemClick }) => {
  const { user, switchProfessional } = useAuth();
  const pendingCount = usePendingCount();
  const [switchingPro, setSwitchingPro] = React.useState(false);

  const linkedProfessionals = user?.linkedProfessionals || [];
  const showProfessionalSwitcher =
    user?.currentRole === 'secretaria' && linkedProfessionals.length > 1;

  const handleProfessionalChange = async (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const id = Number(e.target.value);
    if (!id || id === user?.linkedProfessionalId) return;
    try {
      setSwitchingPro(true);
      await switchProfessional(id);
      // Recarrega para que todas as telas com escopo do profissional refaçam
      // suas requisições já com o novo token/profissional ativo.
      window.location.reload();
    } catch (err) {
      console.error('Erro ao trocar profissional:', err);
      setSwitchingPro(false);
    }
  };

  // Navigation links based on user current role. Cada item tem uma cor própria
  // de ícone (decisão do dono do convênio: navbar mais colorida).
  const getNavLinks = () => {
    if (user?.currentRole === 'client') {
      return [
        { to: '/client', icon: <Home size={20} />, label: 'Início', color: 'text-red-400' },
        { to: '/client/professionals', icon: <Users size={20} />, label: 'Profissionais', color: 'text-red-400' },
      ];
    } else if (user?.currentRole === 'professional') {
      return [
        { to: '/professional', icon: <Home size={20} />, label: 'Início', color: 'text-red-400' },
        { to: '/professional/scheduling', icon: <CalendarDays size={20} />, label: 'Agenda', color: 'text-red-400' },
        { to: '/atendimento', icon: <MessageCircle size={20} />, label: 'Atendimento', color: 'text-red-400' },
        { to: '/professional/private-patients', icon: <UserCheck size={20} />, label: 'Pacientes Particulares', color: 'text-red-400' },
        { to: '/professional/services', icon: <FileText size={20} />, label: 'Meus Serviços', color: 'text-red-400' },
        { to: '/professional/insurances', icon: <Shield size={20} />, label: 'Convênios Aceitos', color: 'text-red-400' },
        { to: '/professional/medical-records', icon: <Stethoscope size={20} />, label: 'Prontuários', color: 'text-red-400' },
        { to: '/professional/documents', icon: <FileImage size={20} />, label: 'Documentos', color: 'text-red-400' },
        { to: '/professional/reports', icon: <BarChart2 size={20} />, label: 'Relatórios', color: 'text-red-400' },
        { to: '/professional/profile', icon: <Settings size={20} />, label: 'Perfil', color: 'text-red-400' },
      ];
    } else if (user?.currentRole === 'secretaria') {
      return [
        { to: '/professional', icon: <Home size={20} />, label: 'Início', color: 'text-red-400' },
        { to: '/atendimento', icon: <MessageCircle size={20} />, label: 'Atendimento', color: 'text-red-400' },
        { to: '/professional/scheduling', icon: <CalendarDays size={20} />, label: 'Agenda', color: 'text-red-400' },
        { to: '/professional/private-patients', icon: <UserCheck size={20} />, label: 'Pacientes Particulares', color: 'text-red-400' },
        { to: '/professional/services', icon: <FileText size={20} />, label: 'Meus Serviços', color: 'text-red-400' },
        { to: '/professional/insurances', icon: <Shield size={20} />, label: 'Convênios Aceitos', color: 'text-red-400' },
      ];
    } else if (user?.currentRole === 'admin') {
      return [
        { to: '/admin', icon: <Home size={20} />, label: 'Início', color: 'text-red-400' },
        { to: '/admin/users', icon: <Users size={20} />, label: 'Usuários', color: 'text-red-400' },
        { to: '/admin/scheduling-access', icon: <Clock size={20} />, label: 'Acesso à Agenda', color: 'text-red-400' },
        { to: '/admin/affiliates', icon: <DollarSign size={20} />, label: 'Afiliados', color: 'text-red-400' },
        { to: '/admin/agenda-partners', icon: <UserCheck size={20} />, label: 'Parceiros da Agenda', color: 'text-red-400' },
        { to: '/admin/coupons', icon: <Ticket size={20} />, label: 'Cupons', color: 'text-red-400' },
        { to: '/admin/reports', icon: <BarChart2 size={20} />, label: 'Relatórios', color: 'text-red-400' },
      ];
    } else if (user?.currentRole === 'vendedor') {
      return [
        { to: '/affiliate', icon: <Home size={20} />, label: 'Painel', color: 'text-red-400' },
      ];
    } else if (user?.currentRole === 'financeiro_agenda') {
      return [
        { to: '/financeiro/agenda', icon: <DollarSign size={20} />, label: 'Financeiro Agenda', color: 'text-red-400' },
      ];
    }

    return [];
  };

  const navLinks = getNavLinks();

  return (
    <aside className="h-full">
      <div className="p-4">
        {showProfessionalSwitcher && (
          <div className="mb-4 rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2">
            <label
              htmlFor="professional-switcher"
              className="mb-1 flex items-center gap-1 text-xs font-medium text-indigo-800"
            >
              <UserCheck size={14} className="text-indigo-600" />
              Profissional ativo
            </label>
            <select
              id="professional-switcher"
              value={user?.linkedProfessionalId ?? ''}
              onChange={handleProfessionalChange}
              disabled={switchingPro}
              className="w-full rounded-md border border-indigo-200 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring focus:ring-indigo-200 disabled:opacity-60"
            >
              {linkedProfessionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {switchingPro && (
              <p className="mt-1 text-xs text-indigo-600">Trocando…</p>
            )}
          </div>
        )}
        {(user?.currentRole === 'professional' || user?.currentRole === 'secretaria') &&
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
              {React.cloneElement(link.icon, { className: `${link.color} shrink-0` })}
              <span className="ml-3">{link.label}</span>
              {link.to === '/atendimento' && pendingCount > 0 && (
                <span className="ml-auto rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
