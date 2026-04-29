import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';
import logo from '../../assets/CONNEXO LOGO.png';

const Login = ({ onLogin, onAdminBypass }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeRole, setActiveRole] = useState('VENDEDOR'); // Just for UI toggle

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ 
        height: '100vh', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        justifyContent: 'center', 
        padding: '2rem' 
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <motion.img 
          src={logo} 
          alt="Connexo Logo" 
          style={{ width: '220px', marginBottom: '1.5rem' }}
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5 }}
        />
        <h2 style={{ fontSize: '1.2rem', letterSpacing: '2px', opacity: 0.8 }}>ACCESO AL ECOSISTEMA</h2>
      </div>

      <div style={{ display: 'flex', gap: '10px', width: '100%', maxWidth: '350px', marginBottom: '1.5rem' }}>
        <button 
          onClick={() => setActiveRole('VENDEDOR')}
          style={{ 
            flex: 1, 
            padding: '12px', 
            borderRadius: 'var(--radius-sm)', 
            border: '1px solid var(--accent)', 
            background: activeRole === 'VENDEDOR' ? 'var(--accent)' : 'transparent',
            color: activeRole === 'VENDEDOR' ? 'black' : 'var(--accent)',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Vendedor
        </button>
        <button 
          onClick={() => setActiveRole('DISTRIBUIDOR')}
          style={{ 
            flex: 1, 
            padding: '12px', 
            borderRadius: 'var(--radius-sm)', 
            border: '1px solid var(--accent)', 
            background: activeRole === 'DISTRIBUIDOR' ? 'var(--accent)' : 'transparent',
            color: activeRole === 'DISTRIBUIDOR' ? 'black' : 'var(--accent)',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Distribuidor
        </button>
      </div>

      <form onSubmit={handleSubmit} className="card glass" style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        <div>
          <label htmlFor="email" style={{ display: 'block', fontSize: '0.7rem', marginBottom: '6px', color: 'var(--text-secondary)' }}>USUARIO / EMAIL</label>
          <input 
            id="email"
            type="email" 
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ejemplo@connexo.com"
            style={{ width: '100%', padding: '0.9rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)', color: 'white' }}
          />
        </div>

        <div>
          <label htmlFor="password" style={{ display: 'block', fontSize: '0.7rem', marginBottom: '6px', color: 'var(--text-secondary)' }}>CONTRASEÑA</label>
          <input 
            id="password"
            type="password" 
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{ width: '100%', padding: '0.9rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)', color: 'white' }}
          />
        </div>

        <button type="submit" className="btn btn-primary" style={{ padding: '1rem', width: '100%' }}>
          Ingresar al Panel
        </button>
      </form>

      <p style={{ marginTop: '2rem', fontSize: '0.7rem', opacity: 0.5 }}>Connexo v2.0 © 2026</p>

    </motion.div>
  );
};

export default Login;
