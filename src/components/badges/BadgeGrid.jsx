import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const BADGES_INFO = {
  PIONEER: {
    id: 'PIONEER',
    title: 'Pionero Fundador',
    subtitle: 'Certificación de Origen',
    description: 'Otorgado de forma exclusiva a los primeros distribuidores autorizados que creyeron en la revolución del networking inteligente e impulsaron la infraestructura de Connexo desde el día cero.',
    color: '#000000',
    borderColor: '#FFD700', // Dorado
    icon: '⚡' // Un rayo dorado cruzando un mapa sutil (representado por icono para frontend rápido)
  },
  GOLD_HAMMER: {
    id: 'GOLD_HAMMER',
    title: 'Martillo de Oro',
    subtitle: 'Maestría en Ventas',
    description: 'Otorgado manualmente a distribuidores que han demostrado una habilidad sobresaliente para cerrar tratos y colocar volumen de hardware NFC de manera consistente en el mercado.',
    color: '#0033A0', // Azul cobalto
    borderColor: '#FFFFFF',
    icon: '🤝' // Apretón de manos
  },
  RECURRING_LORD: {
    id: 'RECURRING_LORD',
    title: 'Señor del Recurrente',
    subtitle: 'Tracción y Retención SaaS',
    description: 'Este parche certifica al distribuidor como un estratega de software. Otorgado a quienes priorizan la retención a largo plazo convirtiendo clientes de hardware a suscripciones recurrentes PRO y ULTRA.',
    color: '#8A2BE2', // Morado neón
    borderColor: '#FF00FF',
    icon: '∞' // Bucle infinito
  },
  VERIFIED_DIST: {
    id: 'VERIFIED_DIST',
    title: 'Distribuidor Verificado',
    subtitle: 'Sello de Confianza Elite',
    description: 'La máxima insignia de seguridad. Otorgada directamente por los Super Admins de Connexo para validar la identidad, excelente soporte y buenas prácticas comerciales de este distribuidor autorizado.',
    color: '#00C957', // Verde esmeralda
    borderColor: '#FFFFFF',
    icon: '🛡️' // Escudo de armas
  },
  LEAD_HUNTER: {
    id: 'LEAD_HUNTER',
    title: 'Cazador de Leads',
    subtitle: 'Especialista en Conversión',
    description: 'Otorgado a los distribuidores que dominan el discurso de venta de captura de datos. Reconoce a quienes configuran y educan activamente a sus clientes para explotar la integración del Mini-CRM de Connexo.',
    color: '#CD7F32', // Naranja cobre
    borderColor: '#FFA500',
    icon: '🧲' // Imán
  },
  BRILLIANT_MIND: {
    id: 'BRILLIANT_MIND',
    title: 'Mente Brillante',
    subtitle: 'Networking Inteligente',
    description: 'Otorgado a distribuidores que promueven la optimización de perfiles mediante Inteligencia Artificial. Certifica la habilidad para guiar a los usuarios en la creación de biografías y copies de alta conversión dentro de la plataforma.',
    color: '#2F4F4F', // Gris espacial
    borderColor: '#00BFFF', // Azul eléctrico
    icon: '🧠' // Cerebro
  }
};

const BadgeModal = ({ badge, onClose }) => {
  if (!badge) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        style={{
          background: `linear-gradient(135deg, #111, ${badge.color}33)`,
          border: `2px solid ${badge.borderColor}88`,
          borderRadius: '16px', padding: '2rem', maxWidth: '400px', width: '100%',
          boxShadow: `0 10px 40px ${badge.color}66`,
          position: 'relative'
        }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
        
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: '80px', height: '90px', margin: '0 auto 1rem',
            background: badge.color,
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.5rem', border: `3px solid ${badge.borderColor}`,
            boxShadow: `0 0 20px ${badge.color}`
          }}>
            {badge.icon}
          </div>
          <h2 style={{ margin: '0 0 4px', color: 'white', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '1px' }}>{badge.title}</h2>
          <h4 style={{ margin: 0, color: badge.borderColor, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px' }}>{badge.subtitle}</h4>
        </div>
        
        <p style={{ color: '#ccc', fontSize: '0.9rem', lineHeight: '1.6', textAlign: 'center', margin: '0 0 1.5rem' }}>
          "{badge.description}"
        </p>
        
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '0.65rem', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Otorgada oficialmente por el Comité Connexo
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};

const BadgeGrid = ({ activeBadges = [], isAdminMode = false, onToggleBadge }) => {
  const [selectedBadge, setSelectedBadge] = useState(null);

  const handleBadgeClick = (badgeKey) => {
    if (isAdminMode && onToggleBadge) {
      onToggleBadge(badgeKey);
    } else {
      setSelectedBadge(BADGES_INFO[badgeKey]);
    }
  };

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
        gap: '15px',
        padding: '20px 0',
        justifyItems: 'center'
      }}>
        {Object.keys(BADGES_INFO).map((key) => {
          const badge = BADGES_INFO[key];
          const isUnlocked = activeBadges.includes(key);

          return (
            <div
              key={key}
              onClick={() => handleBadgeClick(key)}
              style={{
                width: '75px', height: '85px',
                position: 'relative', cursor: 'pointer',
                transition: 'all 0.3s ease',
                transform: isAdminMode ? 'scale(1)' : (isUnlocked ? 'scale(1)' : 'scale(0.95)')
              }}
            >
              {/* Contenedor del Hexágono */}
              <div style={{
                width: '100%', height: '100%',
                background: isUnlocked || isAdminMode ? badge.color : '#333',
                clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2rem',
                border: isUnlocked || isAdminMode ? `2px solid ${badge.borderColor}` : '2px solid #555',
                filter: (!isUnlocked && !isAdminMode) ? 'grayscale(100%) opacity(0.4)' : 'none',
                boxShadow: isUnlocked ? `0 0 15px ${badge.color}88` : 'none',
                transition: 'all 0.3s ease'
              }}>
                {(!isUnlocked && !isAdminMode) ? '🔒' : badge.icon}
              </div>

              {/* Toggle indicator for Admin Mode */}
              {isAdminMode && (
                <div style={{
                  position: 'absolute', bottom: '-5px', right: '-5px',
                  background: isUnlocked ? 'var(--success)' : '#555',
                  borderRadius: '50%', width: '20px', height: '20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid #111', fontSize: '10px', color: 'white',
                  zIndex: 10
                }}>
                  {isUnlocked ? '✓' : '✕'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {selectedBadge && <BadgeModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />}
      </AnimatePresence>
    </>
  );
};

export default BadgeGrid;
