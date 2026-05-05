import React from 'react';
import { Home, BarChart3, GraduationCap, Users, User, Settings, Package } from 'lucide-react';

const BottomNav = ({ activeTab, setActiveTab, role }) => {
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const allNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <Home size={20} />,        roles: ['SUPER_ADMIN', 'DISTRIBUTOR', 'SELLER'] },
    { id: 'sales',     label: 'Ventas',    icon: <BarChart3 size={20} />,   roles: ['DISTRIBUTOR', 'SELLER'] },
    { id: 'academy',   label: 'Academia',  icon: <GraduationCap size={20} />, roles: ['DISTRIBUTOR', 'SELLER'] },
    { id: 'inventory', label: 'Inventario', icon: <Package size={20} />, roles: ['SUPER_ADMIN', 'DISTRIBUTOR'] },
    { id: 'network',   label: isSuperAdmin ? 'Admin' : 'Red', icon: isSuperAdmin ? <Settings size={20} /> : <Users size={20} />, roles: ['SUPER_ADMIN', 'DISTRIBUTOR'] },
    { id: 'profile',   label: 'Perfil',   icon: <User size={20} />,         roles: ['SUPER_ADMIN', 'DISTRIBUTOR', 'SELLER'] },
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
