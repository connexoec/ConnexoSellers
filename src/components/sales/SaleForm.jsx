import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Phone, Mail, Building2, FileText } from 'lucide-react';

const inputStyle = {
  width: '100%',
  padding: '11px 11px 11px 40px',
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid var(--glass-border)',
  color: 'white',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.85rem'
};

const iconStyle = { position: 'absolute', left: '12px', top: '12px', opacity: 0.45 };

const SaleForm = ({ plan, onConfirm, onCancel }) => {
  const [customer, setCustomer] = useState({
    name: '', phone: '', email: '', company: '', notes: ''
  });
  const [billingCycle, setBillingCycle] = useState('annually'); // 'annually' o 'monthly'

  const currentPrice = plan.id === 'PRO'
    ? (billingCycle === 'monthly' ? 7.00 : 97.00)
    : (billingCycle === 'monthly' ? 15.00 : 179.00);

  const set = (field) => (e) => setCustomer({ ...customer, [field]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(customer, billingCycle);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        padding: '1rem',
        fontFamily: 'Verdana, sans-serif'
      }}
    >
      <div
        className="card glass"
        style={{
          width: '100%', maxWidth: '440px',
          border: '1px solid var(--accent)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
          maxHeight: '90vh', overflowY: 'auto'
        }}
      >
        {/* Plan Summary */}
        <div style={{
          background: 'rgba(255,102,0,0.12)',
          border: '1px solid rgba(255,102,0,0.3)',
          borderRadius: '10px',
          padding: '1rem',
          marginBottom: '1.2rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <p style={{ fontSize: '0.6rem', opacity: 0.6, marginBottom: '4px', textTransform: 'uppercase' }}>Plan Seleccionado</p>
            <h3 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.1rem' }}>{plan.label} {billingCycle === 'monthly' ? 'Mensual' : 'Anual'}</h3>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.6rem', opacity: 0.6, marginBottom: '4px', textTransform: 'uppercase' }}>Precio</p>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>${currentPrice.toFixed(2)}<span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{billingCycle === 'monthly' ? '/mes' : '/año'}</span></h3>
          </div>
        </div>

        {/* Frecuencia Selector Segment */}
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.65rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', fontWeight: 700 }}>Frecuencia de Facturación</p>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              type="button"
              onClick={() => setBillingCycle('annually')}
              style={{
                flex: 1, padding: '8px', borderRadius: '6px', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                background: billingCycle === 'annually' ? 'var(--accent)' : 'transparent',
                color: billingCycle === 'annually' ? 'var(--bg-primary)' : 'rgba(255,255,255,0.5)'
              }}
            >
              📅 Suscripción Anual
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              style={{
                flex: 1, padding: '8px', borderRadius: '6px', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                background: billingCycle === 'monthly' ? 'var(--accent)' : 'transparent',
                color: billingCycle === 'monthly' ? 'var(--bg-primary)' : 'rgba(255,255,255,0.5)'
              }}
            >
              🌙 Suscripción Mensual
            </button>
          </div>
        </div>

        <h3 style={{ marginBottom: '1.2rem', fontSize: '0.9rem', textTransform: 'uppercase', opacity: 0.8 }}>
          Datos del Cliente / Empresa
        </h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>

          {/* Nombre completo */}
          <div style={{ position: 'relative' }}>
            <User size={16} style={iconStyle} />
            <input
              required
              placeholder="Nombre completo del cliente *"
              aria-label="Nombre del cliente"
              value={customer.name}
              onChange={set('name')}
              style={inputStyle}
            />
          </div>

          {/* Empresa / Negocio */}
          <div style={{ position: 'relative' }}>
            <Building2 size={16} style={iconStyle} />
            <input
              placeholder="Empresa o nombre del negocio (opcional)"
              aria-label="Empresa"
              value={customer.company}
              onChange={set('company')}
              style={inputStyle}
            />
          </div>

          {/* Teléfono */}
          <div style={{ position: 'relative' }}>
            <Phone size={16} style={iconStyle} />
            <input
              required
              type="tel"
              placeholder="Número de WhatsApp / Teléfono *"
              aria-label="Teléfono"
              value={customer.phone}
              onChange={set('phone')}
              style={inputStyle}
            />
          </div>

          {/* Email */}
          <div style={{ position: 'relative' }}>
            <Mail size={16} style={iconStyle} />
            <input
              type="email"
              placeholder="Correo electrónico (opcional)"
              aria-label="Email del cliente"
              value={customer.email}
              onChange={set('email')}
              style={inputStyle}
            />
          </div>

          {/* Notas */}
          <div style={{ position: 'relative' }}>
            <FileText size={16} style={{ ...iconStyle, top: '13px' }} />
            <textarea
              placeholder="Notas adicionales (opcional)"
              aria-label="Notas"
              value={customer.notes}
              onChange={set('notes')}
              rows={3}
              style={{
                ...inputStyle,
                resize: 'none',
                paddingTop: '12px',
                lineHeight: '1.5'
              }}
            />
          </div>

          <div style={{
            display: 'flex', gap: '10px',
            marginTop: '0.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid rgba(255,255,255,0.08)'
          }}>
            <button
              type="button"
              onClick={onCancel}
              className="btn glass"
              style={{ flex: 1, fontSize: '0.8rem' }}
            >
              CANCELAR
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 2, fontSize: '0.8rem', textTransform: 'uppercase' }}
            >
              Registrar Venta · {plan.id} {billingCycle === 'monthly' ? 'Mensual' : 'Anual'}
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default SaleForm;
