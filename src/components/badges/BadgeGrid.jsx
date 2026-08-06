import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

// Los criterios de las insignias automáticas viven en src/lib/badges.js (lógica
// pura, sin React, para poder probarla fuera del navegador).
import { CRITERIOS_AUTO } from '../../lib/badges';

export const BADGES_INFO = {
  // --- BÁSICAS / INICIO (Bordes plateados, colores suaves) ---
  FIRST_BLOOD: {
    id: 'FIRST_BLOOD',
    title: 'Primer\nImpacto',
    subtitle: 'Iniciación de Ventas.',
    description: 'Otorgado de forma oficial al registrar y entregar la primera tarjeta Connexo física del distribuidor. El primer paso para digitalizar el networking de toda una región.',
    color: '#4A6B82', // Gris azulado
    borderColor: '#C0C0C0', // Plateado
    icon: '🎴'
  },
  SAAS_STARTER: {
    id: 'SAAS_STARTER',
    title: 'SaaS\nStarter',
    subtitle: 'Primer Recurrente.',
    description: 'Otorgado al distribuidor que cierra su primera venta de software de pago (Plan PRO o ULTRA). Marca el ingreso oficial al modelo de ingresos recurrentes de Connexo.',
    color: '#40E0D0', // Turquesa suave
    borderColor: '#C0C0C0', // Plateado
    icon: '🚀'
  },
  ACADEMY_LV1: {
    id: 'ACADEMY_LV1',
    title: 'Operador\nIniciado',
    subtitle: 'Capacitación Básica.',
    description: 'Otorgado tras completar satisfactoriamente los módulos de inducción sobre el ecosistema Connexo, configuración de perfiles y uso del panel de control.',
    color: '#98FF98', // Verde menta
    borderColor: '#C0C0C0', // Plateado
    icon: '📖'
  },
  GOLD_HAMMER: {
    id: 'GOLD_HAMMER',
    title: 'Martillo\nde Oro',
    subtitle: 'Maestría en Ventas',
    description: 'Otorgado manualmente a distribuidores que han demostrado una habilidad sobresaliente para cerrar tratos y colocar volumen de hardware NFC de manera consistente en el mercado.',
    color: '#0033A0', // Azul cobalto
    borderColor: '#FFFFFF', // Plateado/Blanco
    icon: '🤝'
  },
  BRILLIANT_MIND: {
    id: 'BRILLIANT_MIND',
    title: 'Mente\nBrillante',
    subtitle: 'Networking Inteligente',
    description: 'Otorgado a distribuidores que promueven la optimización de perfiles mediante Inteligencia Artificial. Certifica la habilidad para guiar a los usuarios en la creación de biografías y copies de alta conversión dentro de la plataforma.',
    color: '#2F4F4F', // Gris espacial
    borderColor: '#00BFFF', // Azul eléctrico
    icon: '🧠'
  },
  LEAD_HUNTER: {
    id: 'LEAD_HUNTER',
    title: 'Cazador\nde Leads',
    subtitle: 'Especialista en Conversión',
    description: 'Otorgado a los distribuidores que dominan el discurso de venta de captura de datos. Reconoce a quienes configuran y educan activamente a sus clientes para explotar la integración del Mini-CRM de Connexo.',
    color: '#CD7F32', // Naranja cobre
    borderColor: '#FFA500', // Naranja/Dorado
    icon: '🧲'
  },

  // --- ÉLITE / AVANZADAS (Bordes dorados, fondos oscuros neón) ---
  PIONEER: {
    id: 'PIONEER',
    title: 'Pionero\nFundador',
    subtitle: 'Certificación de Origen',
    description: 'Otorgado de forma exclusiva a los primeros distribuidores autorizados que creyeron en la revolución del networking inteligente e impulsaron la infraestructura de Connexo desde el día cero.',
    color: '#000000', // Negro mate
    borderColor: '#FFD700', // Dorado
    icon: '⚡'
  },
  RECURRING_LORD: {
    id: 'RECURRING_LORD',
    title: 'Señor del\nRecurrente',
    subtitle: 'Tracción y Retención SaaS',
    description: 'Este parche certifica al distribuidor como un estratega de software. Otorgado a quienes priorizan la retención a largo plazo convirtiendo clientes de hardware a suscripciones recurrentes PRO y ULTRA.',
    color: '#1f003a', // Morado oscuro
    borderColor: '#FFD700', // Dorado
    icon: '∞'
  },
  VERIFIED_DIST: {
    id: 'VERIFIED_DIST',
    title: 'Distribuidor\nVerificado',
    subtitle: 'Sello de Confianza Elite',
    description: 'La máxima insignia de seguridad. Otorgada directamente por los Super Admins de Connexo para validar la identidad, excelente soporte y buenas prácticas comerciales de este distribuidor autorizado.',
    color: '#004b23', // Verde noche esmeralda
    borderColor: '#FFD700', // Dorado
    icon: '🛡️'
  },
  CORPORATE_CLOSER: {
    id: 'CORPORATE_CLOSER',
    title: 'Cazador de\nGigantes',
    subtitle: 'Cierre Corporativo.',
    description: 'La insignia de los grandes contratos. Otorgada exclusivamente a distribuidores que han cerrado cuentas corporativas vendiendo lotes de volumen para equipos de trabajo o empresas enteras.',
    color: '#1c1c1c', // Negro grafito
    borderColor: '#FFD700', // Dorado brillante
    icon: '🏙️'
  },
  SAAS_TITAN: {
    id: 'SAAS_TITAN',
    title: 'Titán del\nRecurrente',
    subtitle: 'Maestría en Retención.',
    description: 'Reservado para la élite de ventas. Otorgado manualmente a distribuidores que mantienen una cartera activa de más de 50 suscripciones de software mensuales o anuales bajo su código de afiliado.',
    color: '#2a004f', // Violeta magenta profundo
    borderColor: '#FFD700', // Dorado brillante
    icon: '📊'
  },
  CERTIFIED_MASTER: {
    id: 'CERTIFIED_MASTER',
    title: 'Maestro\nCertificado',
    subtitle: 'Especialista en Growth.',
    description: 'La máxima acreditación académica de Connexo. Otorgada a los distribuidores que han aprobado los cursos avanzados de Copywriting de Conversión, Estrategia SaaS y Growth Marketing dictados por la compañía.',
    color: '#0f172a', // Azul oscuro medianoche
    borderColor: '#FFD700', // Dorado brillante texturizado
    icon: '🎓'
  },
  MONTHLY_CHAMP: {
    id: 'MONTHLY_CHAMP',
    title: 'Campeón\nMensual',
    subtitle: 'Meta 30 Suscripciones.',
    description: 'Otorgado a los vendedores de élite que han alcanzado la meta mensual de 30 o más suscripciones de software activas (planes PRO o ULTRA). Reconoce la constancia y activa un bono exclusivo de $40 directo a la billetera.',
    color: '#FF8C00', // Naranja oscuro / Dorado
    borderColor: '#FFD700', // Dorado brillante
    icon: '🏆'
  },
  BASE_SALARY_UNLOCKED: {
    id: 'BASE_SALARY_UNLOCKED',
    title: 'Sueldo\nActivado',
    subtitle: 'Ventas Anuales.',
    description: 'Otorgado por alcanzar las 8 ventas anuales, liberando oficialmente el cobro de Sueldo Base Garantizado. Demuestra un alto nivel de compromiso a largo plazo.',
    color: '#00FF7F', // Verde primavera brillante
    borderColor: '#FFFFFF', 
    icon: '💰'
  }
};

const HEX = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
const esElite = (b) => b.borderColor === '#FFD700';

const BadgeModal = ({ badge, desbloqueada, onClose }) => {
  if (!badge) return null;
  const auto = CRITERIOS_AUTO[badge.id];
  return createPortal(
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
        
        {/* Cómo se consigue */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem',
          display: 'flex', gap: 10, alignItems: 'flex-start'
        }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>{auto ? '⚙️' : '🎖️'}</span>
          <div style={{ flex: 1 }}>
            <p style={{
              margin: 0, fontSize: '0.6rem', letterSpacing: '1.5px', fontWeight: 800,
              textTransform: 'uppercase', color: auto ? 'var(--success)' : badge.borderColor
            }}>
              {auto ? 'Automática' : 'Otorgada por el Comité Connexo'}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: '#bbb', lineHeight: 1.45 }}>
              {auto
                ? auto.texto
                : 'La asigna un Super Admin desde el panel de red cuando reconoce el mérito.'}
            </p>
          </div>
        </div>

        <div style={{
          marginTop: '1rem', padding: '7px 12px', borderRadius: 100, textAlign: 'center',
          background: desbloqueada ? 'rgba(30,224,160,0.12)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${desbloqueada ? 'var(--success)' : 'rgba(255,255,255,0.12)'}`
        }}>
          <p style={{
            margin: 0, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '1px',
            textTransform: 'uppercase', color: desbloqueada ? 'var(--success)' : 'rgba(255,255,255,0.45)'
          }}>
            {desbloqueada ? '✓ Desbloqueada' : '🔒 Todavía bloqueada'}
          </p>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

const Hexagono = ({ badge, isUnlocked, atenuado }) => {
  const elite = esElite(badge);
  const apagada = !isUnlocked && !atenuado;
  return (
    <div style={{ position: 'relative', width: 76, height: 86 }}>
      {/* Halo detrás: solo en las desbloqueadas */}
      {isUnlocked && (
        <div style={{
          position: 'absolute', inset: -7, clipPath: HEX, filter: 'blur(9px)',
          background: elite ? badge.borderColor : badge.color, opacity: 0.45
        }} />
      )}
      {/* Marco (el borde real: un hexágono debajo, ligeramente mayor) */}
      <div style={{
        position: 'absolute', inset: 0, clipPath: HEX,
        background: apagada
          ? 'rgba(255,255,255,0.12)'
          : `linear-gradient(160deg, ${badge.borderColor}, ${badge.borderColor}55 55%, ${badge.borderColor})`
      }} />
      {/* Cara */}
      <div style={{
        position: 'absolute', inset: 2.5, clipPath: HEX,
        background: apagada
          ? 'linear-gradient(160deg, #241a14, #14100d)'
          : `linear-gradient(155deg, ${badge.color}ee, ${badge.color}88 45%, #05030200 46%), linear-gradient(160deg, ${badge.color}, #120a06)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.75rem', lineHeight: 1,
        filter: apagada ? 'grayscale(100%)' : 'none'
      }}>
        <span style={{
          opacity: apagada ? 0.35 : 1,
          filter: apagada ? 'none' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))'
        }}>
          {apagada ? '🔒' : badge.icon}
        </span>
      </div>
      {/* Brillo superior: da sensación de metal esmaltado */}
      {!apagada && (
        <div style={{
          position: 'absolute', inset: 2.5, clipPath: HEX, pointerEvents: 'none',
          background: 'linear-gradient(200deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.07) 32%, transparent 52%)'
        }} />
      )}
    </div>
  );
};

const BadgeGrid = ({ activeBadges = [], isAdminMode = false, onToggleBadge }) => {
  const [selectedBadge, setSelectedBadge] = useState(null);

  const handleBadgeClick = (badgeKey) => {
    if (isAdminMode && onToggleBadge) onToggleBadge(badgeKey);
    else setSelectedBadge(BADGES_INFO[badgeKey]);
  };

  const claves = Object.keys(BADGES_INFO);
  const conseguidas = claves.filter((k) => activeBadges.includes(k)).length;
  const porcentaje = Math.round((conseguidas / claves.length) * 100);

  // Primero las conseguidas: la vitrina se ve como un logro, no como una lista
  // de candados.
  const ordenadas = [...claves].sort((a, b) => {
    const da = activeBadges.includes(a) ? 0 : 1;
    const db = activeBadges.includes(b) ? 0 : 1;
    return da - db || claves.indexOf(a) - claves.indexOf(b);
  });

  return (
    <>
      {!isAdminMode && (
        <div style={{ margin: '4px 0 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
            <p style={{ margin: 0, fontSize: '0.62rem', letterSpacing: '1.5px', textTransform: 'uppercase', opacity: 0.55 }}>
              Vitrina de insignias
            </p>
            <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 800, color: 'var(--accent-light)' }}>
              {conseguidas} <span style={{ opacity: 0.45, fontWeight: 600 }}>/ {claves.length}</span>
            </p>
          </div>
          <div style={{ height: 5, borderRadius: 10, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <motion.div
              className="progress-fill"
              initial={{ width: 0 }}
              animate={{ width: `${porcentaje}%` }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              style={{ height: '100%' }}
            />
          </div>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))',
        gap: '14px 8px',
        padding: '18px 0',
        justifyItems: 'center'
      }}>
        {ordenadas.map((key) => {
          const badge = BADGES_INFO[key];
          const isUnlocked = activeBadges.includes(key);
          const auto = !!CRITERIOS_AUTO[key];

          return (
            <motion.div
              key={key}
              onClick={() => handleBadgeClick(key)}
              whileHover={{ y: -5, scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              title={badge.title.replace('\n', ' ')}
              style={{
                position: 'relative', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: 86
              }}
            >
              <Hexagono badge={badge} isUnlocked={isUnlocked} atenuado={isAdminMode} />

              <p style={{
                margin: 0, fontSize: '0.53rem', lineHeight: 1.15, textAlign: 'center',
                whiteSpace: 'pre-line', fontWeight: 700, letterSpacing: '0.3px',
                textTransform: 'uppercase',
                color: isUnlocked ? 'var(--text-primary)' : 'rgba(255,255,255,0.32)'
              }}>
                {badge.title}
              </p>

              {/* Marca de "se gana sola", solo en las que aún faltan */}
              {auto && !isUnlocked && !isAdminMode && (
                <span style={{
                  position: 'absolute', top: -2, right: 4, fontSize: '0.42rem', fontWeight: 800,
                  letterSpacing: '0.5px', padding: '1px 4px', borderRadius: 100,
                  background: 'rgba(30,224,160,0.15)', color: 'var(--success)',
                  border: '1px solid rgba(30,224,160,0.4)'
                }}>
                  AUTO
                </span>
              )}

              {isAdminMode && (
                <div style={{
                  position: 'absolute', top: 60, right: 6,
                  background: isUnlocked ? 'var(--success)' : '#555',
                  borderRadius: '50%', width: 20, height: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid var(--bg-primary)', fontSize: 10, color: 'white', zIndex: 10
                }}>
                  {isUnlocked ? '✓' : '✕'}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {selectedBadge && (
          <BadgeModal
            badge={selectedBadge}
            desbloqueada={activeBadges.includes(selectedBadge.id)}
            onClose={() => setSelectedBadge(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default BadgeGrid;
