import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { getTermsPoints, INCOME_DISCLAIMER } from '../../constants/legal';

// Pantalla que bloquea la app hasta que el vendedor/distribuidor acepta los
// términos de colaboración. La fecha y la versión aceptadas se guardan en el perfil.
const TermsGate = ({ user, onAccept, onLogout }) => {
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const puntos = getTermsPoints(user?.role);
  const nombre = (user?.full_name || '').split(' ')[0];

  const aceptar = async () => {
    if (!checked || saving) return;
    setSaving(true);
    setError('');
    try {
      await onAccept();
    } catch (err) {
      setError(err?.message || 'No se pudo registrar tu aceptación. Inténtalo de nuevo.');
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
      <div className="card glass" style={{ width: '100%', maxWidth: '520px', padding: '1.5rem', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.4rem' }}>
          <ShieldCheck size={26} color="var(--accent)" />
          <h1 style={{ fontSize: '1.15rem', margin: 0 }}>Términos de colaboración</h1>
        </div>
        <p style={{ fontSize: '0.8rem', margin: '0 0 1rem', opacity: 0.85 }}>
          {nombre ? `Hola, ${nombre}. ` : ''}Antes de continuar, lee y acepta cómo trabajamos juntos.
        </p>

        <div
          style={{
            maxHeight: '48vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            paddingRight: '4px',
          }}
        >
          {puntos.map((p) => (
            <div
              key={p.title}
              style={{
                padding: '10px 12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '10px',
              }}
            >
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.8rem', color: 'var(--accent-light)' }}>
                {p.icon} {p.title}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 400 }}>
                {p.text}
              </p>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: '12px',
            padding: '10px 12px',
            borderRadius: '10px',
            background: 'rgba(255,122,26,0.08)',
            border: '1px solid var(--accent-glow)',
            fontSize: '0.72rem',
            fontWeight: 600,
            color: 'var(--accent-light)',
          }}
        >
          ⚠️ {INCOME_DISCLAIMER}
        </div>

        <label
          style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '14px', cursor: 'pointer', fontSize: '0.78rem', lineHeight: 1.45 }}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ width: '18px', height: '18px', marginTop: '1px', accentColor: 'var(--accent)', flexShrink: 0 }}
          />
          <span>He leído y acepto estos términos. Se guardará la fecha y la hora de mi aceptación.</span>
        </label>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '0.72rem', margin: '10px 0 0' }}>{error}</p>
        )}

        <button
          onClick={aceptar}
          disabled={!checked || saving}
          className="btn btn-primary"
          style={{
            width: '100%',
            marginTop: '14px',
            opacity: !checked || saving ? 0.45 : 1,
            cursor: !checked || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Guardando…' : 'Aceptar y continuar'}
        </button>

        <button
          onClick={onLogout}
          style={{
            display: 'block',
            margin: '12px auto 0',
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '0.7rem',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </motion.div>
  );
};

export default TermsGate;
