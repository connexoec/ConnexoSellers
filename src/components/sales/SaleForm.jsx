import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Phone } from 'lucide-react';

const SaleForm = ({ plan, onConfirm, onCancel }) => {
  const [customer, setCustomer] = useState({ name: '', phone: '' });

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(customer);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }} 
      animate={{ opacity: 1, scale: 1 }}
      className="card glass" 
      style={{ 
        position: 'fixed', 
        top: '20%', 
        left: '5%', 
        right: '5%', 
        zIndex: 2000,
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        border: '1px solid var(--accent)',
        fontFamily: 'Verdana, sans-serif'
      }}
    >
      <h3 style={{ marginBottom: '1.5rem', color: 'var(--accent)', fontSize: '1rem', textTransform: 'uppercase' }}>
        Nueva Venta: {plan.label}
      </h3>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ position: 'relative' }}>
          <User size={18} style={{ position: 'absolute', left: '12px', top: '12px', opacity: 0.5 }} />
          <input 
            required 
            placeholder="Nombre completo del cliente" 
            aria-label="Nombre completo del cliente"
            value={customer.name}
            onChange={(e) => setCustomer({...customer, name: e.target.value})}
            style={{ width: '100%', padding: '12px 12px 12px 40px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: 'var(--radius-sm)' }}
          />
        </div>
        
        <div style={{ position: 'relative' }}>
          <Phone size={18} style={{ position: 'absolute', left: '12px', top: '12px', opacity: 0.5 }} />
          <input 
            required 
            type="tel"
            placeholder="Número de contacto (WhatsApp)" 
            aria-label="Número de contacto"
            value={customer.phone}
            onChange={(e) => setCustomer({...customer, phone: e.target.value})}
            style={{ width: '100%', padding: '12px 12px 12px 40px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: 'var(--radius-sm)' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
          <button type="button" onClick={onCancel} className="btn glass" style={{ flex: 1, fontSize: '0.8rem' }}>CANCELAR</button>
          <button type="submit" className="btn btn-primary" style={{ flex: 2, fontSize: '0.8rem', textTransform: 'uppercase' }}>
            Registrar Venta de {plan.label}
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default SaleForm;
