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

// Insignia: cristal casi negro con un filo de luz de color y halo alrededor.
// Nada de degradados metálicos ni brillos falsos: el color solo aparece en el
// contorno y en el resplandor, que es lo que le da el aire de neón.
const Insignia = ({ badge, isUnlocked, atenuado, tam = 64 }) => {
  const activa = isUnlocked || atenuado;
  const luz = esElite(badge) ? badge.borderColor : badge.color;

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: tam, aspectRatio: '0.88' }}>
      {/* Resplandor exterior */}
      {isUnlocked && (
        <div style={{
          position: 'absolute', inset: '-18%', clipPath: HEX, background: luz,
          opacity: 0.28, filter: 'blur(7px)'
        }} />
      )}

      {/* Filo de luz (hexágono de color; el de dentro lo recorta a un hilo) */}
      <div style={{
        position: 'absolute', inset: 0, clipPath: HEX,
        background: activa
          ? `linear-gradient(150deg, ${luz}, ${luz}55 42%, ${luz}22 58%, ${luz})`
          : 'rgba(255,255,255,0.13)'
      }} />

      {/* Cara de cristal */}
      <div style={{
        position: 'absolute', inset: 1.5, clipPath: HEX,
        background: activa
          ? `radial-gradient(120% 85% at 50% 6%, ${luz}2e 0%, ${luz}0f 42%, rgba(8,5,4,0.97) 72%), #080504`
          : 'radial-gradient(120% 85% at 50% 6%, rgba(255,255,255,0.05), #0b0807 70%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <span style={{
          fontSize: `${tam * 0.42}px`, lineHeight: 1,
          opacity: activa ? 1 : 0.22,
          filter: activa
            ? `drop-shadow(0 0 6px ${luz}cc) drop-shadow(0 1px 2px rgba(0,0,0,0.8))`
            : 'grayscale(100%)'
        }}>
          {activa ? badge.icon : '🔒'}
        </span>
      </div>
    </div>
  );
};

const BadgeModal = ({ badge, desbloqueada, onClose }) => {
  if (!badge) return null;
  const auto = CRITERIOS_AUTO[badge.id];
  const luz = esElite(badge) ? badge.borderColor : badge.color;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.86)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 16 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        style={{
          background: `radial-gradient(120% 70% at 50% 0%, ${luz}1c 0%, transparent 58%), #0a0605`,
          border: `1px solid ${luz}55`,
          borderRadius: 18, padding: '1.9rem 1.6rem 1.4rem', maxWidth: 380, width: '100%',
          boxShadow: `0 24px 70px rgba(0,0,0,0.8), 0 0 40px -18px ${luz}`,
          position: 'relative'
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute', top: 12, right: 14, background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.4)', fontSize: '1rem', cursor: 'pointer', lineHeight: 1
          }}
        >
          ✕
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.1rem' }}>
          <Insignia badge={badge} isUnlocked={desbloqueada} atenuado tam={96} />
        </div>

        <h2 style={{
          margin: '0 0 5px', textAlign: 'center', color: 'white', fontFamily: 'var(--font-heading)',
          textTransform: 'uppercase', letterSpacing: '1.5px', fontSize: '1.15rem',
          whiteSpace: 'pre-line', lineHeight: 1.15
        }}>
          {badge.title}
        </h2>
        <p style={{
          margin: '0 0 1.3rem', textAlign: 'center', color: luz, fontSize: '0.62rem',
          textTransform: 'uppercase', letterSpacing: '3px', fontWeight: 700
        }}>
          {badge.subtitle}
        </p>

        <p style={{
          color: 'rgba(255,255,255,0.62)', fontSize: '0.78rem', lineHeight: 1.65,
          textAlign: 'center', margin: '0 0 1.3rem'
        }}>
          {badge.description}
        </p>

        {/* Cómo se consigue */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '1rem',
          display: 'flex', gap: 10, alignItems: 'flex-start'
        }}>
          <span style={{
            flexShrink: 0, width: 6, height: 6, borderRadius: '50%', marginTop: 5,
            background: auto ? 'var(--success)' : luz,
            boxShadow: `0 0 7px ${auto ? 'var(--success)' : luz}`
          }} />
          <div style={{ flex: 1 }}>
            <p style={{
              margin: 0, fontSize: '0.55rem', letterSpacing: '2px', fontWeight: 700,
              textTransform: 'uppercase', color: auto ? 'var(--success)' : luz
            }}>
              {auto ? 'Se desbloquea sola' : 'La otorga el Comité Connexo'}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
              {auto
                ? auto.texto
                : 'La asigna un Super Admin desde el panel de red cuando reconoce el mérito.'}
            </p>
          </div>
        </div>

        <p style={{
          margin: '1.1rem 0 0', textAlign: 'center', fontSize: '0.58rem', fontWeight: 700,
          letterSpacing: '2px', textTransform: 'uppercase',
          color: desbloqueada ? 'var(--success)' : 'rgba(255,255,255,0.25)'
        }}>
          {desbloqueada ? '— Desbloqueada —' : '— Bloqueada —'}
        </p>
      </motion.div>
    </motion.div>,
    document.body
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

  // Primero las conseguidas: la vitrina se lee como un logro, no como una pared
  // de candados.
  const ordenadas = [...claves].sort((a, b) => {
    const da = activeBadges.includes(a) ? 0 : 1;
    const db = activeBadges.includes(b) ? 0 : 1;
    return da - db || claves.indexOf(a) - claves.indexOf(b);
  });

  return (
    <>
      {!isAdminMode && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '0 2px 2px'
        }}>
          <p style={{
            margin: 0, fontSize: '0.58rem', letterSpacing: '2.5px',
            textTransform: 'uppercase', opacity: 0.42, fontWeight: 600
          }}>
            Vitrina
          </p>
          <p style={{ margin: 0, fontSize: '0.62rem', letterSpacing: '1px', fontWeight: 700 }}>
            <span style={{ color: 'var(--accent-light)' }}>{conseguidas}</span>
            <span style={{ opacity: 0.3 }}> / {claves.length}</span>
          </p>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px 10px',
        padding: '16px 0 4px',
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
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.93 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              title={badge.title.replace('\n', ' ')}
              style={{
                position: 'relative', cursor: 'pointer', width: '100%',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7
              }}
            >
              <Insignia badge={badge} isUnlocked={isUnlocked} atenuado={isAdminMode} />

              <p style={{
                margin: 0, fontSize: '0.46rem', lineHeight: 1.25, textAlign: 'center',
                whiteSpace: 'pre-line', fontWeight: 600, letterSpacing: '0.8px',
                textTransform: 'uppercase',
                color: isUnlocked ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.22)'
              }}>
                {badge.title}
              </p>

              {/* Punto tenue en las que se ganan solas y aún faltan */}
              {auto && !isUnlocked && !isAdminMode && (
                <span
                  title="Se desbloquea sola"
                  style={{
                    position: 'absolute', top: 1, right: '18%', width: 5, height: 5,
                    borderRadius: '50%', background: 'var(--success)',
                    boxShadow: '0 0 6px var(--success)', opacity: 0.75
                  }}
                />
              )}

              {isAdminMode && (
                <div style={{
                  position: 'absolute', top: '52%', right: '6%',
                  background: isUnlocked ? 'var(--success)' : '#4a4a4a',
                  borderRadius: '50%', width: 17, height: 17,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid var(--bg-primary)', fontSize: 9, color: 'white', zIndex: 10
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
