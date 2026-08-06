// ─── Almacenamiento local a prueba de cuota ──────────────────────────────────
// El navegador da ~5 MB por origen. Una foto de perfil en base64 puede pesar
// varios MB, así que una escritura de caché puede lanzar QuotaExceededError.
// Ese error NUNCA debe tumbar el flujo de negocio que la disparó (login,
// guardar perfil, registrar venta): la caché es un extra, no la fuente de verdad.

export const SESSION_KEY = 'connexo_session';
export const avatarKey = (uid) => `connexo_avatar_${uid}`;

export function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`⚠️ No se pudo guardar "${key}" en localStorage:`, err?.message || err);
    return false;
  }
}

// La sesión se guarda SIN el avatar: la foto vive en su propia clave y se
// vuelve a unir al restaurar. Así una foto grande no impide guardar la sesión.
export function saveSession(user) {
  if (!user) return false;
  const { avatar_url, ...sinFoto } = user;
  const ok = safeSetItem(SESSION_KEY, JSON.stringify(sinFoto));
  const uid = user.id || user.uid;
  if (avatar_url && uid) safeSetItem(avatarKey(uid), avatar_url);
  return ok;
}

export function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  const user = JSON.parse(raw);
  if (user && !user.avatar_url) {
    const foto = localStorage.getItem(avatarKey(user.id || user.uid));
    if (foto) user.avatar_url = foto;
  }
  return user;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
