import { Bell, ArrowLeft } from 'lucide-react';

const Header = ({ user, notificationCount = 0, onShowNotifications, activeTab, onBack }) => {
  return (
    <header style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'Verdana, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {activeTab !== 'dashboard' && (
          <button 
            onClick={onBack} 
            className="btn glass" 
            style={{ padding: '8px', border: '1px solid var(--accent)' }}
            aria-label="Volver al dashboard"
          >
            <ArrowLeft size={18} color="var(--accent)" />
          </button>
        )}
        <div>
          <p style={{ fontSize: '0.7rem', marginBottom: '2px', opacity: 0.6, textTransform: 'uppercase' }}>Sesión Activa</p>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{user.name}</h3>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <button 
          onClick={onShowNotifications}
          style={{ position: 'relative', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '5px' }}
          aria-label={`Ver ${notificationCount} notificaciones`}
        >
          <Bell size={22} />
          {notificationCount > 0 && (
            <span style={{ 
              position: 'absolute', 
              top: 0, 
              right: 0, 
              background: 'var(--accent)', 
              color: 'black', 
              fontSize: '0.6rem', 
              fontWeight: 900, 
              width: '16px', 
              height: '16px', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              border: '2px solid var(--bg-primary)'
            }}>
              {notificationCount}
            </span>
          )}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span className="tier-badge" style={{ background: 'var(--accent)', color: 'black', fontWeight: 900, fontSize: '0.6rem' }}>
            {user.role}
          </span>
          {user.is_certified ? (
            <span style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 700 }}>✓ CERT</span>
          ) : (
            <span style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 700 }}>⚠ PEND</span>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
