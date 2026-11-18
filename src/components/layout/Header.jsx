import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import NotificationCenter from '../notifications/NotificationCenter';
import Flag from './Flag';

const Header = ({ user, activeTab, onBack, selectedSedeContext = 'GLOBAL', onChangeContext, onNavigate }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <header style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-main)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {activeTab !== 'dashboard' && (
          <button 
            onClick={onBack} 
            className="btn glass" 
            style={{ padding: '8px' }}
            aria-label="Volver al dashboard"
          >
            <ArrowLeft size={18} color="var(--accent-light)" />
          </button>
        )}
        <div>
          <p className="eyebrow" style={{ marginBottom: '2px' }}>Sesión activa</p>
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
                background: 'rgba(245, 236, 229, 0.04)',
                border: '1px solid var(--line-strong)',
                color: 'white',
                fontSize: '1.1rem',
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                outline: 'none',
                transition: 'all 0.2s'
              }}
            >
              <Flag pais={selectedSedeContext} size={20} />
            </button>

            {isDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '46px',
                  right: 0,
                  background: 'rgba(14, 12, 11, 0.97)',
                  border: '1px solid var(--line-strong)',
                  borderRadius: '12px',
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
                  { value: 'GLOBAL', label: 'Global' },
                  { value: 'Ecuador', label: 'Ecuador' },
                  { value: 'Venezuela', label: 'Venezuela' }
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
                    <Flag pais={item.value} size={18} />
                    <span style={{ fontSize: '0.7rem' }}>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <NotificationCenter userId={user?.id || user?.uid} onNavigate={onNavigate} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span
            className="tier-badge"
            style={{
              background: 'rgba(255, 122, 26, 0.12)',
              color: 'var(--accent-light)',
              border: '1px solid var(--accent-glow)',
              borderRadius: '999px',
              padding: '2px 9px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 500,
              fontSize: '0.58rem',
              letterSpacing: '0.12em'
            }}
          >
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
