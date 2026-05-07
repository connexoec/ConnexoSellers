import { useState } from 'react';
import { Bell, ArrowLeft } from 'lucide-react';

const Header = ({ user, notificationCount = 0, onShowNotifications, activeTab, onBack, selectedSedeContext = 'GLOBAL', onChangeContext }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-label="Selector de Mercado"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--accent)',
                color: 'white',
                fontSize: '1.1rem',
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 0 10px var(--accent-glow)',
                outline: 'none',
                transition: 'all 0.2s'
              }}
            >
              {selectedSedeContext === 'GLOBAL' ? '🌎' : selectedSedeContext === 'Ecuador' ? '🇪🇨' : '🇻🇪'}
            </button>

            {isDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '46px',
                  right: 0,
                  background: 'rgba(20, 5, 0, 0.95)',
                  border: '1px solid var(--accent)',
                  borderRadius: '10px',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  zIndex: 2000,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  minWidth: '120px'
                }}
              >
                {[
                  { value: 'GLOBAL', emoji: '🌎', label: 'Global' },
                  { value: 'Ecuador', emoji: '🇪🇨', label: 'Ecuador' },
                  { value: 'Venezuela', emoji: '🇻🇪', label: 'Venezuela' }
                ].map(item => (
                  <button
                    key={item.value}
                    onClick={() => {
                      onChangeContext && onChangeContext(item.value);
                      setIsDropdownOpen(false);
                    }}
                    style={{
                      background: selectedSedeContext === item.value ? 'var(--accent)' : 'transparent',
                      border: 'none',
                      color: selectedSedeContext === item.value ? 'var(--bg-primary)' : 'white',
                      fontSize: '0.95rem',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      width: '100%'
                    }}
                  >
                    <span>{item.emoji}</span>
                    <span style={{ fontSize: '0.7rem' }}>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
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
