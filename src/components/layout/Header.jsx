import { Bell, ArrowLeft } from 'lucide-react';

const Header = ({ user, notificationCount = 0, onShowNotifications, activeTab, onBack, selectedSedeContext = 'GLOBAL', onChangeContext }) => {
  return (
    <header style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-main)' }}>
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
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>{user.name}</h3>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }} aria-live="polite">
        {user.role === 'SUPER_ADMIN' && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <select
              value={selectedSedeContext}
              onChange={(e) => onChangeContext && onChangeContext(e.target.value)}
              aria-label="Cambiar Mercado / Contexto de Vista"
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(33, 9, 0, 0.8)',
                border: '1px solid var(--accent)',
                color: 'var(--text-primary)',
                fontSize: '0.75rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-main)',
                boxShadow: '0 0 10px var(--accent-glow)'
              }}
            >
              <option value="GLOBAL">🌎 Vista Global</option>
              <option value="Ecuador">🇪🇨 Vista Ecuador</option>
              <option value="Venezuela">🇻🇪 Vista Venezuela</option>
            </select>
          </div>
        )}

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
              color: 'var(--bg-primary)', 
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
          <span className="tier-badge" style={{ background: 'var(--accent)', color: 'var(--bg-primary)', fontWeight: 900, fontSize: '0.6rem' }}>
            {user.role}
          </span>
          {user.is_certified ? (
            <span style={{ fontSize: '0.6rem', color: 'var(--success)', fontWeight: 700 }}>✓ CERT</span>
          ) : (
            <span style={{ fontSize: '0.6rem', color: 'var(--danger)', fontWeight: 700 }}>⚠ PEND</span>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
