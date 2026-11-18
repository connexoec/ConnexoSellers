import React from 'react';
import { INCOME_DISCLAIMER } from '../../constants/legal';

// Aviso permanente al pie de todas las pantallas de vendedores y distribuidores.
const IncomeNotice = () => (
  <p
    role="note"
    style={{
      margin: '0 auto',
      maxWidth: '420px',
      padding: '0 1.5rem',
      marginBottom: 'calc(var(--nav-height) + 14px)',
      textAlign: 'center',
      fontSize: '0.62rem',
      lineHeight: 1.5,
      color: 'var(--text-secondary)',
      opacity: 0.6,
    }}
  >
    ⚠️ {INCOME_DISCLAIMER}
  </p>
);

export default IncomeNotice;
