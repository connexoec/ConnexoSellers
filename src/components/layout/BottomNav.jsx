import React from 'react';
import { Home, BarChart3, GraduationCap, Users, User, Settings, Package, FileText, PlusCircle } from 'lucide-react';

const BottomNav = ({ activeTab, setActiveTab, role }) => {
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const allNavItems = [
    { id: 'dashboard', label: 'Inicio',     icon: <Home size={18} />,        roles: ['SUPER_ADMIN', 'DISTRIBUTOR', 'SELLER'] },
    { id: 'sales',     label: 'Nueva Venta', icon: <PlusCircle size={18} />,   roles: ['DISTRIBUTOR', 'SELLER'] },
    { id: 'history',   label: 'Movimientos', icon: <FileText size={18} />,     roles: ['SUPER_ADMIN', 'DISTRIBUTOR', 'SELLER'] },
    { id: 'academy',   label: 'Academia',  icon: <GraduationCap size={18} />, roles: ['SUPER_ADMIN', 'DISTRIBUTOR', 'SELLER'] },
    { id: 'inventory', label: 'Almacén',    icon: <Package size={18} />,     roles: ['SUPER_ADMIN', 'DISTRIBUTOR'] },
    { id: 'network',   label: isSuperAdmin ? 'Admin' : 'Red', icon: isSuperAdmin ? <Settings size={18} /> : <Users size={18} />, roles: ['SUPER_ADMIN', 'DISTRIBUTOR'] },
    { id: 'profile',   label: 'Perfil',   icon: <User size={18} />,         roles: ['SUPER_ADMIN', 'DISTRIBUTOR', 'SELLER'] },
  ];

  const navItems = allNavItems.filter(item => item.roles.includes(role));

  return (
    <nav className="bottom-nav glass">
      {navItems.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
          onClick={() => setActiveTab(item.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label={item.label}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default BottomNav;
