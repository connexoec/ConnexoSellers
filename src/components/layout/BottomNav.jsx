import React from 'react';

const BottomNav = ({ activeTab, setActiveTab, role }) => {
  const navItems = [
    { id: 'dashboard', label: 'Inicio', icon: '🏠' },
    { id: 'sales', label: 'Ventas', icon: '📊' },
    { id: 'academy', label: 'Academia', icon: '🎓' },
    { id: 'network', label: role === 'SUPER_ADMIN' ? 'Admin' : 'Red', icon: role === 'SUPER_ADMIN' ? '🛠️' : '👥' },
    { id: 'profile', label: 'Perfil', icon: '👤' },
  ];

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
