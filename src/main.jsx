import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// ── Service Worker ───────────────────────────────────────────────────────────
// Hace la app instalable (requisito para que el push funcione en iOS) y es
// quien muestra las notificaciones cuando la app está cerrada.
// Se registra tras `load` para no competir con la carga inicial.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('⚠️ No se pudo registrar el service worker:', err?.message || err);
    });
  });
}
