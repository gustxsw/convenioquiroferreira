import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import ProfessionalOnboardingBanner from '../components/ProfessionalOnboardingBanner';
import AgendaOnlyConvenioCta from '../components/AgendaOnlyConvenioCta';
import { useAuth } from '../contexts/AuthContext';
import { Menu } from 'lucide-react';

/**
 * Telas em grade (agenda, atendimento) que ficam melhores ocupando a largura toda.
 *
 * O teto padrão de 1280px foi pensado para páginas de texto e formulário, onde
 * linha curta ajuda a ler. Numa agenda ele só sobrava: em monitor de 1920px
 * sobravam ~320px de fundo cinza dos dois lados enquanto as colunas dos dias
 * ficavam espremidas. O teto maior aproveita a tela sem deixar a grade esticar
 * sem fim em monitores ultrawide.
 */
const WIDE_ROUTES = ['/professional/scheduling', '/atendimento'];

const MainLayout: React.FC = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isWide = WIDE_ROUTES.some((route) => pathname.startsWith(route));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} />
      
      <div className="flex flex-1 relative">
        {/* Mobile sidebar backdrop */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        
        {/* Sidebar */}
        <div className={`
          fixed md:static inset-y-0 left-0 transform 
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 transition-transform duration-200 ease-in-out
          z-30 md:z-0 w-64 bg-white shadow-md
        `}>
          <Sidebar onItemClick={() => setIsSidebarOpen(false)} />
        </div>
        
        {/* Main content */}
        {/* O padding fica: a agenda o cancela com margens negativas próprias para
            sangrar o fundo, e tirá-lo daqui jogaria o conteúdo para fora do container. */}
        <main className="flex-1 p-4 md:p-6 w-full overflow-x-hidden">
          <div className={isWide ? 'max-w-[1600px] mx-auto' : 'max-w-7xl mx-auto'}>
            {user?.currentRole === 'professional' && <ProfessionalOnboardingBanner />}
            {user?.currentRole === 'professional' &&
              user?.professionalType === 'agenda_only' && (
                <AgendaOnlyConvenioCta />
              )}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;