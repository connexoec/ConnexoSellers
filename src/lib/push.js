import { supabase } from './supabase';

// Llave pública VAPID. Es pública por diseño (viaja al navegador). Se deja como
// fallback hardcodeado para que funcione en Vercel aunque no inyecte las envs,
// igual que el cliente de Supabase.
const VAPID_PUBLIC_KEY =
  import.meta.env?.VITE_VAPID_PUBLIC_KEY ||
  'BFJpgAAVjDr9FR37uKLA3UchVJ_og0Bst2W6Bpv5cPabXtv7yM_qehgqCcPsiU268j2kzj6yYmFwd05x3JaG72Q';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * ¿La suscripción existente se creó con la MISMA llave VAPID que usamos hoy?
 *
 * Es la causa silenciosa nº1 de "en la PC llega y en el teléfono no": el
 * navegador guarda la suscripción para siempre, así que un dispositivo que se
 * suscribió con una llave anterior devuelve `getSubscription()` como buena, se
 * guarda en la base sin errores (la interfaz se pone verde) y el servidor de
 * push la rechaza con 403 en cada envío. Hay que detectarla y re-suscribir.
 */
function subscriptionKeyMatches(sub, expected) {
  const raw = sub.options?.applicationServerKey;
  if (!raw) return false; // sin llave conocida → mejor re-suscribir
  const actual = new Uint8Array(raw);
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) return false;
  }
  return true;
}

export function pushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission() {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

/** ¿Es un iPhone/iPad que todavía NO está instalado en la pantalla de inicio? */
export function iosNeedsInstall() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const esIOS = /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1); // iPad en modo escritorio
  if (!esIOS) return false;
  const instalada =
    window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true;
  return !instalada;
}

// Compat: Safari antiguo usa requestPermission(callback) en vez de promesa.
function requestPermissionCompat() {
  return new Promise((resolve) => {
    try {
      const p = Notification.requestPermission((res) => resolve(res));
      if (p && typeof p.then === 'function') {
        p.then(resolve).catch(() => resolve(Notification.permission));
      }
    } catch {
      resolve(Notification.permission);
    }
  });
}

/**
 * Muestra una notificación LOCAL en este dispositivo (sin pasar por el backend).
 * Sirve para comprobar que el permiso y el service worker funcionan aquí.
 */
export async function sendLocalTest() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    let permission = Notification.permission;
    if (permission !== 'granted') permission = await requestPermissionCompat();
    if (permission === 'denied') return { ok: false, reason: 'denied' };
    if (permission !== 'granted') return { ok: false, reason: 'dismissed' };

    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Connexo Ventas ✅', {
      body: 'Las notificaciones funcionan en este dispositivo.',
      icon: '/icon-192.png',
      badge: '/connexo-badge.png',
      tag: 'connexo-test',
      vibrate: [80, 40, 80],
      data: { url: '/' },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e?.name ? e.name + ': ' : '') + (e?.message || String(e)) };
  }
}

/**
 * Garantiza que la suscripción de ESTE dispositivo exista y esté guardada en
 * Supabase, SIN pedir permiso (solo actúa si ya está concedido). Se llama en
 * cada carga: repara suscripciones perdidas o rotadas.
 */
export async function ensurePushSubscription(userId) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (!userId) return { ok: false, reason: 'no-user' };
  if (Notification.permission !== 'granted') return { ok: false, reason: 'no-permission' };
  return enablePush(userId); // no vuelve a pedir permiso si ya está concedido
}

/**
 * Pide permiso (solo si hace falta), crea la suscripción Web Push y la guarda
 * en Supabase. Idempotente: si ya está suscrito, reutiliza o actualiza el
 * registro. Devuelve un `reason` descriptivo con la causa real si falla.
 */
export async function enablePush(userId, opts) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (!userId) return { ok: false, reason: 'no-user' };

  try {
    // Si YA está concedido no se vuelve a pedir (evita falsos "denegado").
    let permission = Notification.permission;
    if (permission !== 'granted') permission = await requestPermissionCompat();
    if (permission === 'denied') return { ok: false, reason: 'denied' };
    if (permission !== 'granted') return { ok: false, reason: 'dismissed' };

    const reg = await navigator.serviceWorker.ready;
    const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    let sub = await reg.pushManager.getSubscription();

    // Se descarta la suscripción existente si quedó atada a otra llave VAPID
    // (o si se pidió reparar a mano): si no, se reutilizaría una suscripción
    // que el servidor de push rechaza en cada envío.
    if (sub && (opts?.force || !subscriptionKeyMatches(sub, appServerKey))) {
      const endpointViejo = sub.endpoint;
      try { await sub.unsubscribe(); } catch { /* ignore */ }
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpointViejo);
      sub = null;
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey,
      });
    }

    const json = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
      },
      // Único por (usuario, dispositivo): varias cuentas pueden compartir el
      // mismo teléfono y cada una conserva su propia suscripción.
      { onConflict: 'user_id,endpoint' },
    );
    if (error) return { ok: false, reason: 'db: ' + error.message };

    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e?.name ? e.name + ': ' : '') + (e?.message || String(e)) };
  }
}

/**
 * Fuerza una suscripción nueva en este dispositivo: tira la actual (aunque
 * parezca válida), se vuelve a suscribir y guarda el registro.
 * Es el botón "no me llegan los avisos".
 */
export async function repairPushSubscription(userId) {
  return enablePush(userId, { force: true });
}

/** Desactiva los avisos en ESTE dispositivo y borra su suscripción. */
export async function disablePush(userId) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return { ok: true };
    const endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch { /* ignore */ }
    let query = supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (userId) query = query.eq('user_id', userId);
    await query;
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e?.name ? e.name + ': ' : '') + (e?.message || String(e)) };
  }
}

/** ¿Este dispositivo tiene una suscripción activa guardada? */
export async function isPushActive(userId) {
  if (!pushSupported() || !userId) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const { data } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('endpoint', sub.endpoint)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}
