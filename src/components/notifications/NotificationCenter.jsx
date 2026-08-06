import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, Check, Smartphone, X, BellOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { dataService } from '../../services/dataService';
import {
  enablePush, disablePush, ensurePushSubscription, isPushActive,
  pushPermission, pushSupported, repairPushSubscription, sendLocalTest, iosNeedsInstall
} from '../../lib/push';

// Cada tipo tiene su icono y su color, para reconocer el aviso de un vistazo.
const TIPOS = {
  sale:         { icon: '💰', color: 'var(--accent)' },
  stock:        { icon: '📦', color: 'var(--tier-pro)' },
  stock_status: { icon: '✅', color: 'var(--success)' },
  team:         { icon: '👥', color: 'var(--tier-pro)' },
  certified:    { icon: '🎓', color: 'var(--tier-ultra)' },
  level:        { icon: '🚀', color: 'var(--tier-ultra)' },
  base:         { icon: '💵', color: 'var(--success)' },
  badge:        { icon: '🏅', color: 'var(--tier-ultra)' }
};
const tipoDe = (t) => TIPOS[t] || { icon: '🔔', color: 'var(--accent)' };

const hace = (iso) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'ahora';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} d`;
};

const tabDeUrl = (url) => {
  if (!url) return null;
  const m = String(url).match(/[?&]tab=([a-z_]+)/i);
  return m ? m[1] : null;
};

export default function NotificationCenter({ userId, onNavigate }) {
  const [items, setItems]       = useState([]);
  const [unread, setUnread]     = useState(0);
  const [open, setOpen]         = useState(false);
  const [toast, setToast]       = useState(null);
  const [perm, setPerm]         = useState(() => pushPermission());
  const [activo, setActivo]     = useState(false);   // suscripción viva en ESTE dispositivo
  const [trabajando, setTrabajando] = useState(false);
  const [detalle, setDetalle]   = useState(null);    // texto de error del push, si lo hay
  const [caja, setCaja]         = useState(null);    // posición calculada del panel
  const raizRef  = useRef(null);
  const botonRef = useRef(null);
  const toastRef = useRef(null);

  // ── Posición del panel ────────────────────────────────────────────────────
  // Se calcula y se pinta en un portal con posición FIJA en vez de colgarlo del
  // botón. Anclado al botón se desfasaba en el teléfono: la campana no está
  // pegada al borde derecho (a su lado van el rango y el ✓CERT), así que un
  // panel ancho anclado a ella se salía de la pantalla por la izquierda.
  const recalcular = useCallback(() => {
    const b = botonRef.current?.getBoundingClientRect();
    if (!b) return;
    const margen = 10;
    const ancho = Math.min(360, window.innerWidth - margen * 2);
    // Alinea el borde derecho del panel con el del botón y lo mete en pantalla.
    let izq = b.right - ancho;
    izq = Math.max(margen, Math.min(izq, window.innerWidth - ancho - margen));
    const arriba = b.bottom + 8;
    setCaja({
      left: izq,
      top: arriba,
      width: ancho,
      maxHeight: Math.max(220, window.innerHeight - arriba - margen)
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    recalcular();
    window.addEventListener('resize', recalcular);
    window.addEventListener('scroll', recalcular, true);
    return () => {
      window.removeEventListener('resize', recalcular);
      window.removeEventListener('scroll', recalcular, true);
    };
  }, [open, recalcular]);

  // ── Carga inicial + tiempo real ──────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    let vivo = true;

    dataService.getNotifications(userId).then((data) => {
      if (!vivo) return;
      setItems(data);
      setUnread(data.filter(n => !n.read).length);
    });

    const canal = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new;
          setItems(prev => [n, ...prev.filter(p => p.id !== n.id)].slice(0, 40));
          setUnread(u => u + 1);
          setToast(n);
          if (toastRef.current) clearTimeout(toastRef.current);
          toastRef.current = setTimeout(() => setToast(null), 6500);
        }
      )
      .subscribe();

    return () => {
      vivo = false;
      supabase.removeChannel(canal);
      if (toastRef.current) clearTimeout(toastRef.current);
    };
  }, [userId]);

  // ── Autorreparación: si el permiso YA está dado, garantiza que la
  //    suscripción de este dispositivo exista en la base (sin pedir nada).
  //    Cubre el caso "permiso concedido pero suscripción nunca guardada".
  useEffect(() => {
    if (!userId || !pushSupported()) return;
    let cancelado = false;
    (async () => {
      if (Notification.permission === 'granted') {
        const res = await ensurePushSubscription(userId);
        if (cancelado) return;
        setActivo(res.ok);
        setDetalle(res.ok ? null : res.reason || null);
      } else {
        const vivo = await isPushActive(userId);
        if (!cancelado) setActivo(vivo);
      }
      if (!cancelado) setPerm(pushPermission());
    })();
    return () => { cancelado = true; };
  }, [userId]);

  // Cerrar al hacer clic fuera (el panel vive en un portal, así que se
  // comprueba también contra él) y con la tecla Escape.
  useEffect(() => {
    if (!open) return;
    const fuera = (e) => {
      if (raizRef.current?.contains(e.target)) return;
      if (e.target.closest?.('[data-panel-avisos]')) return;
      setOpen(false);
    };
    const escape = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const marcarLeidas = useCallback(async () => {
    if (unread === 0) return;
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
    await dataService.markNotificationsRead(userId);
  }, [unread, userId]);

  const alternarPanel = () => {
    const siguiente = !open;
    setOpen(siguiente);
    if (siguiente) marcarLeidas();
  };

  const abrirAviso = (n) => {
    const tab = tabDeUrl(n.url);
    if (tab && onNavigate) onNavigate(tab);
    setOpen(false);
    setToast(null);
  };

  const explicarError = (motivo) => {
    if (motivo === 'denied') {
      alert(
        'El navegador tiene las notificaciones BLOQUEADAS para este sitio.\n\n' +
        'Android / Chrome:\n' +
        '• Toca el candado 🔒 (o ⓘ) junto a la dirección web\n' +
        '• "Permisos" → "Notificaciones" → Permitir\n' +
        '• Recarga la página y vuelve a intentar\n\n' +
        'PC: mismo candado 🔒 a la izquierda de la dirección.\n\n' +
        'Revisa también que el sistema permita notificaciones al navegador.'
      );
    } else if (motivo === 'dismissed') {
      alert('No se concedió el permiso. Vuelve a tocar el botón y pulsa "Permitir" en el aviso del navegador.');
    } else if (motivo === 'unsupported') {
      alert(
        'Este navegador no soporta notificaciones push.\n\n' +
        'En iPhone/iPad: Compartir → "Añadir a pantalla de inicio", abre la app ' +
        'desde ese ícono y activa los avisos ahí (requiere iOS 16.4 o superior).'
      );
    } else if (motivo && motivo.includes('does not exist')) {
      // Solo esto significa de verdad "falta el SQL".
      alert(
        'El permiso está bien, pero faltan las tablas de notificaciones.\n' +
        'Ejecuta supabase/migrations/20260806120000_setup_notifications.sql en Supabase.\n\n' +
        'Detalle: ' + motivo
      );
    } else if (motivo && motivo.startsWith('db:')) {
      // Cualquier otro error de base: NO mandar a ejecutar SQL a ciegas.
      alert(
        'El permiso está bien, pero no se pudo guardar la suscripción de este ' +
        'dispositivo.\n\nSi el problema sigue, prueba el botón "¿No llegan?" ' +
        'para renovarla.\n\nDetalle: ' + motivo
      );
    } else {
      alert('No se pudo completar.\nDetalle: ' + (motivo || 'error desconocido'));
    }
  };

  const alternarAvisos = async () => {
    setTrabajando(true);
    if (activo) {
      await disablePush(userId);
      setActivo(false);
      setDetalle(null);
      setTrabajando(false);
      return;
    }
    if (iosNeedsInstall()) {
      setTrabajando(false);
      alert(
        '📲 En iPhone/iPad hay que instalar la app primero:\n\n' +
        '1. Toca Compartir (el cuadrito con la flecha ↑)\n' +
        '2. "Añadir a pantalla de inicio"\n' +
        '3. Abre Connexo desde ese ícono\n' +
        '4. Vuelve aquí y activa los avisos\n\n' +
        'Requiere iOS 16.4 o superior.'
      );
      return;
    }
    const res = await enablePush(userId);
    setTrabajando(false);
    setPerm(pushPermission());
    setActivo(res.ok);
    setDetalle(res.ok ? null : res.reason || null);
    if (!res.ok) explicarError(res.reason);
  };

  const reparar = async () => {
    setTrabajando(true);
    const res = await repairPushSubscription(userId);
    setTrabajando(false);
    setPerm(pushPermission());
    setActivo(res.ok);
    setDetalle(res.ok ? null : res.reason || null);
    if (res.ok) alert('🔄 Suscripción renovada en este dispositivo.');
    else explicarError(res.reason);
  };

  const probar = async () => {
    const res = await sendLocalTest();
    setPerm(pushPermission());
    if (!res.ok) explicarError(res.reason);
  };

  const soportado = pushSupported();

  return (
    <>
      <div style={{ position: 'relative' }} ref={raizRef}>
        <button
          ref={botonRef}
          onClick={alternarPanel}
          aria-label={`Ver notificaciones${unread ? ` (${unread} sin leer)` : ''}`}
          style={{
            position: 'relative', background: 'none', border: 'none',
            color: unread > 0 ? 'var(--accent)' : 'var(--text-primary)',
            cursor: 'pointer', padding: '5px', display: 'flex', alignItems: 'center'
          }}
        >
          <motion.span
            animate={unread > 0 ? { rotate: [0, -14, 12, -8, 6, 0] } : { rotate: 0 }}
            transition={unread > 0 ? { duration: 0.9, repeat: Infinity, repeatDelay: 4 } : {}}
            style={{ display: 'flex', filter: unread > 0 ? 'drop-shadow(0 0 8px var(--accent-glow))' : 'none' }}
          >
            {unread > 0 ? <BellRing size={22} /> : <Bell size={22} />}
          </motion.span>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              style={{
                position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, padding: '0 4px',
                background: 'var(--accent-gradient)', color: '#24100a', fontSize: '0.6rem', fontWeight: 900,
                borderRadius: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid var(--bg-primary)', boxShadow: '0 0 10px var(--accent-glow)'
              }}
            >
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </button>

      </div>

      {createPortal(
        <AnimatePresence>
          {open && caja && (
            <motion.div
              data-panel-avisos
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="glass"
              style={{
                position: 'fixed',
                left: caja.left, top: caja.top, width: caja.width, maxHeight: caja.maxHeight,
                display: 'flex', flexDirection: 'column',
                borderRadius: 16, overflow: 'hidden', zIndex: 4500,
                border: '1px solid var(--accent-glow)',
                boxShadow: '0 18px 50px rgba(0,0,0,0.65), 0 0 30px -12px var(--accent-glow)'
              }}
            >
              {/* Cabecera */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)'
              }}>
                <p style={{
                  margin: 0, fontSize: '0.65rem', fontWeight: 800, letterSpacing: '2px',
                  textTransform: 'uppercase', color: 'var(--accent-light)', fontFamily: 'var(--font-heading)'
                }}>
                  Notificaciones
                </p>
                {items.length > 0 && (
                  <button
                    onClick={marcarLeidas}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                      color: 'var(--text-secondary)', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    <Check size={11} /> Marcar leídas
                  </button>
                )}
              </div>

              {/* Interruptor de avisos en el dispositivo */}
              {soportado ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  background: activo ? 'rgba(30,224,160,0.06)' : 'rgba(255,122,26,0.06)'
                }}>
                  {activo
                    ? <Smartphone size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
                    : <BellOff size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0, fontSize: '0.68rem', fontWeight: 700,
                      color: activo ? 'var(--success)' : 'var(--text-primary)'
                    }}>
                      {activo ? 'Avisos activos en este dispositivo' : 'Avisos desactivados'}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.56rem', opacity: 0.6, color: 'var(--text-secondary)' }}>
                      {activo
                        ? 'Llegan aunque la app esté cerrada'
                        : perm === 'denied'
                          ? 'Bloqueados por el navegador — toca para ver cómo desbloquear'
                          : 'Actívalos para recibirlos en el teléfono o la PC'}
                    </p>
                  </div>
                  {/* Interruptor */}
                  <button
                    onClick={alternarAvisos}
                    disabled={trabajando}
                    role="switch"
                    aria-checked={activo}
                    aria-label={activo ? 'Desactivar avisos en este dispositivo' : 'Activar avisos en este dispositivo'}
                    style={{
                      width: 42, height: 24, flexShrink: 0, borderRadius: 100, position: 'relative',
                      cursor: trabajando ? 'wait' : 'pointer', opacity: trabajando ? 0.6 : 1,
                      border: `1px solid ${activo ? 'var(--success)' : 'rgba(255,255,255,0.18)'}`,
                      background: activo ? 'rgba(30,224,160,0.28)' : 'rgba(255,255,255,0.06)',
                      transition: 'all 0.25s', padding: 0
                    }}
                  >
                    <motion.span
                      animate={{ x: activo ? 19 : 2 }}
                      transition={{ type: 'spring', stiffness: 480, damping: 28 }}
                      style={{
                        position: 'absolute', top: 2, left: 0, width: 18, height: 18, borderRadius: '50%',
                        background: activo ? 'var(--success)' : 'rgba(255,255,255,0.55)',
                        boxShadow: activo ? '0 0 10px var(--success-glow)' : 'none'
                      }}
                    />
                  </button>
                </div>
              ) : (
                <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <p style={{ margin: 0, fontSize: '0.6rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
                    Este navegador no admite avisos al dispositivo.
                    {iosNeedsInstall() && ' En iPhone: Compartir → "Añadir a pantalla de inicio".'}
                  </p>
                </div>
              )}

              {/* Aviso de suscripción rota */}
              {activo === false && perm === 'granted' && detalle && (
                <button
                  onClick={reparar}
                  disabled={trabajando}
                  style={{
                    width: '100%', textAlign: 'left', padding: '9px 14px', cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.07)', border: 'none',
                    background: 'rgba(255,77,94,0.10)', color: 'var(--danger)', fontSize: '0.6rem', fontWeight: 600
                  }}
                >
                  {trabajando ? 'Reintentando…' : `Push sin registrar (${detalle}). Toca para reparar`}
                </button>
              )}

              {/* Lista */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {items.length === 0 ? (
                  <div style={{ padding: '2.4rem 1.2rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.8rem', opacity: 0.35, marginBottom: 8 }}>🔔</div>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', opacity: 0.65, margin: 0 }}>
                      Todavía no hay avisos.
                    </p>
                    <p style={{ fontSize: '0.58rem', color: 'var(--text-secondary)', opacity: 0.45, margin: '4px 0 0' }}>
                      Aquí llegarán las ventas de tu red, los pedidos de stock y tus ascensos de nivel.
                    </p>
                  </div>
                ) : (
                  items.map((n) => {
                    const t = tipoDe(n.type);
                    return (
                      <button
                        key={n.id}
                        onClick={() => abrirAviso(n)}
                        style={{
                          width: '100%', display: 'flex', gap: 10, alignItems: 'flex-start',
                          padding: '11px 14px', textAlign: 'left', cursor: 'pointer',
                          border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)',
                          borderLeft: `2px solid ${n.read ? 'transparent' : t.color}`,
                          background: n.read ? 'transparent' : 'rgba(255,122,26,0.05)',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(255,122,26,0.05)';
                        }}
                      >
                        <span style={{
                          flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem',
                          background: 'rgba(255,255,255,0.05)', border: `1px solid ${t.color}44`
                        }}>
                          {t.icon}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {n.title}
                          </span>
                          {n.body && (
                            <span style={{
                              display: 'block', fontSize: '0.62rem', color: 'var(--text-secondary)',
                              opacity: 0.75, lineHeight: 1.35, marginTop: 1
                            }}>
                              {n.body}
                            </span>
                          )}
                          <span style={{ display: 'block', fontSize: '0.55rem', opacity: 0.4, marginTop: 3 }}>
                            {hace(n.created_at)}
                          </span>
                        </span>
                        {!n.read && (
                          <span style={{
                            flexShrink: 0, width: 6, height: 6, borderRadius: '50%', marginTop: 6,
                            background: t.color, boxShadow: `0 0 8px ${t.color}`
                          }} />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Pie */}
              {soportado && (
                <button
                  onClick={probar}
                  style={{
                    padding: '9px', border: 'none', borderTop: '1px solid rgba(255,255,255,0.07)',
                    background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.6rem',
                    cursor: 'pointer', fontWeight: 600, flexShrink: 0
                  }}
                >
                  🔔 Probar notificación en este dispositivo
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Toast cuando llega un aviso con la app abierta */}
      {createPortal(
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -24, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -18, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="glass"
              style={{
                position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
                width: 'min(420px, 92vw)', zIndex: 5000, borderRadius: 14, padding: '11px 13px',
                display: 'flex', gap: 11, alignItems: 'flex-start', cursor: 'pointer',
                border: `1px solid ${tipoDe(toast.type).color}66`,
                boxShadow: `0 14px 40px rgba(0,0,0,0.6), 0 0 26px -10px ${tipoDe(toast.type).color}`
              }}
              onClick={() => abrirAviso(toast)}
            >
              <span style={{
                flexShrink: 0, width: 30, height: 30, borderRadius: '50%', fontSize: '0.95rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.06)', border: `1px solid ${tipoDe(toast.type).color}55`
              }}>
                {tipoDe(toast.type).icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {toast.title}
                </p>
                {toast.body && (
                  <p style={{ margin: '1px 0 0', fontSize: '0.63rem', color: 'var(--text-secondary)', opacity: 0.8, lineHeight: 1.35 }}>
                    {toast.body}
                  </p>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setToast(null); }}
                aria-label="Cerrar aviso"
                style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', opacity: 0.5, padding: 0 }}
              >
                <X size={15} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
