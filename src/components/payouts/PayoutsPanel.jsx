import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { dataService } from '../../services/dataService';

// Pagos de Connexo a un vendedor/distribuidor y estado de la factura de cada uno.
//
// Flujo:  ⏳ Sin factura → 🧾 Factura cargada (la carga el vendedor) → ✅ Pagada (la marca el Super Admin).
//
// mode="seller": tarjeta dentro del perfil. Se oculta sola si la tabla `payouts`
//                aún no existe en la base.
// mode="admin":  ventana para el Super Admin, con alta de pagos y cambio de estado.

const ESTADOS = {
  PENDIENTE: { label: 'Sin factura', icon: '⏳', color: '#f59e0b' },
  FACTURADA: { label: 'Factura cargada', icon: '🧾', color: 'var(--info)' },
  PAGADA: { label: 'Pagada', icon: '✅', color: 'var(--success)' },
};

const CONCEPTOS = {
  COMISIONES: 'Comisiones',
  BONO: 'Bono por meta',
  COMISIONES_BONO: 'Comisiones + bono por meta',
};

const mesActual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const etiquetaMes = (periodo) => {
  const [y, m] = String(periodo || '').split('-').map(Number);
  if (!y || !m) return periodo || '';
  const txt = new Date(y, m - 1, 1).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};

const dinero = (n) => `$${Number(n || 0).toFixed(2)}`;

const inputStyle = {
  padding: '7px 10px',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid var(--glass-border)',
  color: 'white',
  borderRadius: '8px',
  fontSize: '0.75rem',
  minWidth: 0,
};

const Chip = ({ estado }) => {
  const e = ESTADOS[estado] || ESTADOS.PENDIENTE;
  return (
    <span
      style={{
        fontSize: '0.62rem',
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: '100px',
        color: e.color,
        border: `1px solid ${e.color}`,
        whiteSpace: 'nowrap',
      }}
    >
      {e.icon} {e.label}
    </span>
  );
};

const PayoutsPanel = ({ seller, mode = 'seller', onClose }) => {
  const isAdmin = mode === 'admin';
  const sellerId = seller?.id || seller?.uid;

  const [rows, setRows] = useState([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [facturas, setFacturas] = useState({});
  const [form, setForm] = useState({ period: mesActual(), concept: 'COMISIONES', amount: '', notes: '' });

  // Cada cambio sube `recarga` para volver a pedir la lista a la base.
  const [recarga, setRecarga] = useState(0);
  const cargar = () => setRecarga((n) => n + 1);

  useEffect(() => {
    if (!sellerId) return undefined;
    let vivo = true;
    dataService.getPayouts(sellerId).then((res) => {
      if (!vivo) return;
      setRows(res.rows);
      setMissing(res.missing);
      setLoading(false);
    });
    return () => { vivo = false; };
  }, [sellerId, recarga]);

  // Escape cierra la ventana del administrador.
  useEffect(() => {
    if (!isAdmin || !onClose) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAdmin, onClose]);

  const correr = async (id, fn) => {
    setBusyId(id);
    setError('');
    try {
      await fn();
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const crear = (e) => {
    e.preventDefault();
    const monto = Number(form.amount);
    if (!(monto >= 0) || form.amount === '') {
      setError('Escribe el monto del pago.');
      return;
    }
    correr('nuevo', async () => {
      await dataService.createPayout({
        seller_id: sellerId,
        period: form.period,
        concept: form.concept,
        amount: Math.round(monto * 100) / 100,
        notes: form.notes.trim() || null,
      });
      setForm((f) => ({ ...f, amount: '', notes: '' }));
    });
  };

  const cargarFactura = (row) => {
    const numero = (facturas[row.id] ?? row.invoice_number ?? '').trim();
    if (!numero) {
      setError('Escribe el número de tu factura.');
      return;
    }
    correr(row.id, () => dataService.updatePayout(row.id, { invoice_number: numero, status: 'FACTURADA' }));
  };

  const cambiarEstado = (row, estado) =>
    correr(row.id, () =>
      dataService.updatePayout(row.id, {
        status: estado,
        paid_at: estado === 'PAGADA' ? new Date().toISOString() : null,
      })
    );

  const guardarNumero = (row) => {
    const numero = (facturas[row.id] ?? row.invoice_number ?? '').trim();
    if (numero === (row.invoice_number || '')) return;
    correr(row.id, () => dataService.updatePayout(row.id, { invoice_number: numero || null }));
  };

  const eliminar = (row) => {
    if (!confirm(`¿Eliminar el pago de ${etiquetaMes(row.period)} por ${dinero(row.amount)}?`)) return;
    correr(row.id, () => dataService.deletePayout(row.id));
  };

  // ── Lista de pagos (común a los dos modos) ────────────────────────────────
  const lista = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {rows.length === 0 && !loading && (
        <p style={{ margin: 0, fontSize: '0.72rem', opacity: 0.6, textAlign: 'center', padding: '10px' }}>
          {isAdmin
            ? 'Todavía no hay pagos registrados para esta persona.'
            : 'Aún no tienes pagos registrados. Cuando Connexo registre uno, verás aquí el estado de tu factura.'}
        </p>
      )}

      {rows.map((row) => {
        const valor = facturas[row.id] ?? row.invoice_number ?? '';
        const bloqueado = row.status === 'PAGADA' && !isAdmin;
        return (
          <div
            key={row.id}
            style={{
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '10px',
              opacity: busyId === row.id ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.8rem' }}>
                  {etiquetaMes(row.period)} · {dinero(row.amount)}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '0.65rem', opacity: 0.6 }}>
                  {CONCEPTOS[row.concept] || row.concept}
                  {row.paid_at ? ` · pagada el ${new Date(row.paid_at).toLocaleDateString('es-EC')}` : ''}
                </p>
              </div>
              <Chip estado={row.status} />
            </div>

            {row.notes && <p style={{ margin: '6px 0 0', fontSize: '0.65rem', opacity: 0.6 }}>📝 {row.notes}</p>}

            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                value={valor}
                disabled={bloqueado}
                maxLength={40}
                placeholder="N.º de factura (001-001-000000123)"
                onChange={(e) => setFacturas((f) => ({ ...f, [row.id]: e.target.value }))}
                onBlur={isAdmin ? () => guardarNumero(row) : undefined}
                style={{ ...inputStyle, flex: 1, minWidth: '150px', opacity: bloqueado ? 0.6 : 1 }}
              />

              {!isAdmin && !bloqueado && (
                <button
                  onClick={() => cargarFactura(row)}
                  className="btn btn-primary"
                  style={{ fontSize: '0.65rem', padding: '7px 12px', height: 'auto' }}
                >
                  {row.status === 'FACTURADA' ? 'Actualizar' : 'Enviar factura'}
                </button>
              )}

              {isAdmin && (
                <>
                  <select
                    value={row.status}
                    onChange={(e) => cambiarEstado(row, e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {Object.entries(ESTADOS).map(([k, v]) => (
                      <option key={k} value={k} style={{ background: 'var(--bg-primary)' }}>
                        {v.icon} {v.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => eliminar(row)}
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.62rem', cursor: 'pointer' }}
                  >
                    Eliminar
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const mensajeError = error && <p style={{ color: 'var(--danger)', fontSize: '0.7rem', margin: '8px 0 0' }}>{error}</p>;

  // ── Vista del vendedor/distribuidor ───────────────────────────────────────
  if (!isAdmin) {
    if (loading || missing) return null; // sin tabla aún: no se muestra nada
    return (
      <div className="card glass" style={{ marginTop: '2rem', textAlign: 'left', padding: '1.25rem' }}>
        <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 0.75rem', letterSpacing: '2px', fontWeight: 700, textAlign: 'center' }}>
          Mis pagos y facturas
        </p>
        <p style={{ fontSize: '0.68rem', opacity: 0.7, margin: '0 0 0.75rem', lineHeight: 1.5 }}>
          Connexo paga contra la factura que emites con tu RUC. Escribe aquí el número de tu factura para cada pago.
        </p>
        {lista}
        {mensajeError}
      </div>
    );
  }

  // ── Vista del Super Admin (ventana) ───────────────────────────────────────
  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card glass"
        style={{ width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', padding: '1.25rem', border: '1px solid var(--accent)', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.6 }}>Pagos y facturas</p>
            <h3 style={{ margin: '2px 0 0', fontSize: '1.05rem', color: 'white' }}>{seller?.full_name || seller?.name}</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.65rem', opacity: 0.6 }}>
              {seller?.ruc ? `RUC ${seller.ruc}` : 'Sin RUC registrado'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.1rem', cursor: 'pointer' }} aria-label="Cerrar">✕</button>
        </div>

        {missing ? (
          <p style={{ fontSize: '0.75rem', lineHeight: 1.5, color: '#f59e0b' }}>
            ⚠️ Los pagos aún no están habilitados en la base de datos. Falta ejecutar en Supabase el archivo
            {' '}<code>20261118000000_ruc_terminos_pagos.sql</code>.
          </p>
        ) : (
          <>
            <form onSubmit={crear} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px', padding: '10px', background: 'rgba(255,122,26,0.05)', border: '1px solid var(--accent-glow)', borderRadius: '10px' }}>
              <input type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} required style={{ ...inputStyle, flex: '1 1 130px' }} />
              <select value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} style={{ ...inputStyle, flex: '1 1 150px' }}>
                {Object.entries(CONCEPTOS).map(([k, v]) => (
                  <option key={k} value={k} style={{ background: 'var(--bg-primary)' }}>{v}</option>
                ))}
              </select>
              <input type="number" min="0" step="0.01" placeholder="Monto $" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={{ ...inputStyle, flex: '1 1 90px' }} />
              <input type="text" maxLength={120} placeholder="Nota (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, flex: '2 1 160px' }} />
              <button type="submit" disabled={busyId === 'nuevo'} className="btn btn-primary" style={{ fontSize: '0.68rem', padding: '8px 14px', height: 'auto', flex: '1 1 100%' }}>
                + Registrar pago
              </button>
            </form>
            {loading ? <p style={{ fontSize: '0.72rem', opacity: 0.6 }}>Cargando…</p> : lista}
          </>
        )}
        {mensajeError}
      </div>
    </div>,
    document.body
  );
};

export default PayoutsPanel;
