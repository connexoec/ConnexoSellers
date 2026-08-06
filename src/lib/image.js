// ─── Compresión de imágenes para foto de perfil ──────────────────────────────
// Una foto tomada con el celular pesa 3-5 MB. Guardarla tal cual en base64
// revienta la cuota de localStorage y arrastra megabytes en cada consulta de
// perfiles. Se redimensiona y recomprime antes de guardarla: ~30-60 KB.

export function compressImage(file, { maxSize = 512, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida'));
      img.onload = () => {
        const escala = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // Fondo opaco: los PNG con transparencia quedarían negros en JPEG.
        ctx.fillStyle = '#0d0500';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
