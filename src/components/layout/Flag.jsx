import React from 'react';

// Banderas dibujadas en SVG, NO con emoji.
// Windows no trae los glifos de bandera (los "regional indicators"), así que
// 🇪🇨 y 🇻🇪 salen como dos letras sueltas o un cuadrito en cualquier PC de
// escritorio. En Android e iPhone se ven bien, por eso el fallo solo aparecía
// en la vista de PC. Dibujarlas garantiza que se vean igual en todos lados.

const Flag = ({ pais, size = 18 }) => {
  const alto = Math.round(size * 0.68);
  const comun = {
    width: size, height: alto, borderRadius: 3, display: 'block',
    boxShadow: '0 0 0 1px rgba(255,255,255,0.25)'
  };

  if (pais === 'Ecuador') {
    // Amarillo (mitad superior), azul y rojo.
    return (
      <svg viewBox="0 0 30 20" style={comun} role="img" aria-label="Ecuador">
        <rect width="30" height="10" fill="#FFDD00" />
        <rect y="10" width="30" height="5" fill="#0033A0" />
        <rect y="15" width="30" height="5" fill="#EF3340" />
      </svg>
    );
  }

  if (pais === 'Venezuela') {
    // Tres franjas iguales + el arco de estrellas.
    return (
      <svg viewBox="0 0 30 20" style={comun} role="img" aria-label="Venezuela">
        <rect width="30" height="6.67" fill="#FFDA44" />
        <rect y="6.67" width="30" height="6.67" fill="#0033A0" />
        <rect y="13.34" width="30" height="6.66" fill="#EF3340" />
        <g fill="#fff">
          {[-50, -30, -10, 10, 30, 50].map((a) => {
            const r = 5.2;
            const rad = (a - 90) * (Math.PI / 180);
            return <circle key={a} cx={15 + r * Math.cos(rad)} cy={13.5 + r * Math.sin(rad)} r="0.75" />;
          })}
        </g>
      </svg>
    );
  }

  // GLOBAL: globo terráqueo simplificado.
  return (
    <svg viewBox="0 0 20 20" style={{ ...comun, width: size, height: size, borderRadius: '50%' }}
         role="img" aria-label="Global">
      <circle cx="10" cy="10" r="9.5" fill="#0b3d5c" />
      <ellipse cx="10" cy="10" rx="4" ry="9.5" fill="none" stroke="#4fc3f7" strokeWidth="0.9" />
      <line x1="0.5" y1="10" x2="19.5" y2="10" stroke="#4fc3f7" strokeWidth="0.9" />
      <path d="M2 5.5h16M2 14.5h16" stroke="#4fc3f7" strokeWidth="0.7" opacity="0.7" />
      <circle cx="10" cy="10" r="9.5" fill="none" stroke="#4fc3f7" strokeWidth="1" />
    </svg>
  );
};

export default Flag;
