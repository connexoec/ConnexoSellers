import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { dataService, TIERS } from '../../services/dataService';

const TeamManager = ({ users, currentUser, onAddUser, sales }) => {
  const canAddMembers = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'DISTRIBUTOR';
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Firebase uses uid, fallback to id for compatibility
  const currentUid = currentUser?.uid || currentUser?.id;

  // Si es Super Admin, ve a todos. Si es Distribuidor, solo a sus hijos.
  const myTeam = currentUser?.role === 'SUPER_ADMIN' 
    ? users.filter(u => u.id !== currentUid) // Ver todos menos a sí mismo
    : users.filter(u => u.parent_id === currentUid);

  const teamIds = myTeam.map(u => u.id);
  const teamSales = sales.filter(s => teamIds.includes(s.seller_id));
  const teamVolume = teamSales.reduce((acc, s) => acc + (s.amount || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const userData = {
        name: e.target.name.value,
        email: e.target.email.value,
        role: e.target.role?.value || 'SELLER',
        tier: e.target.tier?.value || null,
        parent_id: currentUid
      };
      const newUser = await dataService.addTeamMember(currentUid, userData);
      onAddUser(newUser);
      setIsAdding(false);
      e.target.reset();
    } catch (err) {
      alert("Error al agregar miembro: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const generatePDF = () => {
    try {
      if (myTeam.length === 0) {
        alert("No hay miembros en la red para generar el reporte.");
        return;
      }
      const doc = new jsPDF();
      doc.setFont('helvetica');
      doc.text(`Reporte de Red - ${currentUser?.full_name || currentUser?.name || ''}`, 14, 20);
      doc.autoTable({
        startY: 30,
        head: [['Vendedor', 'Email', 'Certificado', 'Ventas']],
        body: myTeam.map(u => [
          u.full_name || u.name || 'N/A',
          u.email || '',
          u.is_certified ? 'Sí' : 'No',
          `$${sales.filter(s => s.seller_id === (u.uid || u.id)).reduce((acc, s) => acc + (s.amount || 0), 0).toFixed(2)}`
        ])
      });
      doc.save('reporte_red_connexo.pdf');
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Hubo un error al generar el documento. Verifica los datos.");
    }
  };

  return (
    <div className="slide-up" style={{ padding: '0 1.5rem 100px', fontFamily: 'var(--font-main)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.4rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>Gestión de Red</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={generatePDF} className="btn glass" style={{ width: '44px', height: '44px', padding: 0 }} aria-label="Descargar PDF">
            <Download size={18} />
          </button>
          {canAddMembers && (
            <button onClick={() => setIsAdding(!isAdding)} className="btn btn-primary" aria-label="Agregar vendedor" style={{ textTransform: 'uppercase', fontSize: '0.8rem' }}>
              <UserPlus size={18} /> Crear Nuevo
            </button>
          )}
        </div>
      </div>

      {/* Volumen grupal — solo para Admin y Distribuidor */}
      {currentUser?.role !== 'SELLER' && (
        <div className="card glass" style={{ marginBottom: '2.5rem', border: '1px solid var(--success)', background: 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(0,255,157,0.05) 100%)' }}>
          <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.8 }}>Volumen Grupal de Red</p>
          <h2 style={{ margin: '8px 0', color: 'var(--success)', fontSize: '2rem', textShadow: '0 0 10px rgba(0,255,157,0.3)' }}>${teamVolume.toFixed(2)}</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>Miembros activos: {myTeam.length}</p>
              <div style={{ padding: '4px 12px', background: 'rgba(0,255,157,0.1)', borderRadius: '100px', fontSize: '0.65rem', color: 'var(--success)', fontWeight: 700 }}>LIVE</div>
          </div>
        </div>
      )}

      {isAdding && (
        <motion.form 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          onSubmit={handleSubmit} 
          className="card glass" 
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem', border: '1px solid var(--accent-glow)' }}
        >
          <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', textTransform: 'uppercase', color: 'var(--accent)' }}>Nuevo Miembro</h3>
          <input 
            name="name" required 
            placeholder="Nombre completo" 
            style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px', fontSize: '0.9rem' }} 
          />
          <input 
            name="email" type="email" required 
            placeholder="Correo electrónico" 
            style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px', fontSize: '0.9rem' }} 
          />
          {canAddMembers && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <select
                name="role"
                style={{ flex: 1, padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px', fontSize: '0.9rem' }}
              >
                <option value="SELLER">Rol: Vendedor</option>
                {currentUser?.role === 'SUPER_ADMIN' && (
                  <>
                    <option value="DISTRIBUTOR">Rol: Distribuidor</option>
                    <option value="SUPER_ADMIN">Rol: Super Admin</option>
                  </>
                )}
              </select>

              {currentUser?.role === 'SUPER_ADMIN' && (
                <select
                  name="tier"
                  style={{ flex: 1, padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px', fontSize: '0.9rem' }}
                >
                  <option value="">Rango: AUTO</option>
                  <optgroup label="Vendedores">
                    {TIERS.SELLER.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </optgroup>
                  <optgroup label="Distribuidores">
                    {TIERS.DISTRIBUTOR.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </optgroup>
                </select>
              )}
            </div>
          )}
          <div style={{ padding: '10px', background: 'rgba(0,210,255,0.05)', borderRadius: '8px', border: '1px solid rgba(0,210,255,0.1)' }}>
            <p style={{ fontSize: '0.65rem', opacity: 0.7, margin: 0 }}>
              ⓘ El usuario podrá ingresar con su email y la clave temporal: <b>connexo123</b>
            </p>
          </div>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary" style={{ height: '48px', textTransform: 'uppercase', fontSize: '0.9rem', color: 'var(--bg-primary)' }}>
            {isSubmitting ? 'Procesando...' : 'Confirmar Registro'}
          </button>
        </motion.form>
      )}

      <h3 style={{ marginBottom: '1.2rem', fontSize: '0.9rem', textTransform: 'uppercase', opacity: 0.6, letterSpacing: '1px' }}>Miembros de Red ({myTeam.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {myTeam.length === 0 ? (
          <p style={{ textAlign: 'center', opacity: 0.4, padding: '3rem', fontSize: '0.85rem' }}>
            No se han detectado agentes vinculados.<br/>Use el botón superior para expandir su red.
          </p>
        ) : (
          myTeam.map(u => (
            <div key={u.id} className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent)' }}>
                  {(u.full_name || u.name || 'U').charAt(0)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.full_name || u.name}</p>
                  
                  {/* Selector de Nivel para Super Admin */}
                  {currentUser?.role === 'SUPER_ADMIN' ? (
                    <select 
                      value={u.tier || 'AUTO'}
                      onChange={async (e) => {
                        const newTier = e.target.value === 'AUTO' ? null : e.target.value;
                        const updates = {
                          tier: newTier,
                          // Al asignar categoría, inicia nuevo conteo desde ahora
                          tier_start_date: newTier ? new Date().toISOString() : null
                        };
                        await dataService.updateProfile(u.id, updates);
                        // Invalidar cache de métricas para este usuario
                        window.location.reload();
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 700, padding: 0, cursor: 'pointer' }}
                    >
                      <option value="AUTO" style={{ background: 'var(--bg-primary)' }}>🤖 CÁLCULO AUTO</option>
                      {(u.role === 'SELLER' ? TIERS.SELLER : TIERS.DISTRIBUTOR).map(t => (
                        <option key={t.id} value={t.id} style={{ background: 'var(--bg-primary)' }}>
                          💎 {t.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p style={{ margin: 0, fontSize: '0.7rem', color: u.is_certified ? 'var(--success)' : 'var(--text-secondary)' }}>
                      {u.is_certified ? '✓ Certificado' : '⏳ Verificación Pendiente'}
                    </p>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
                  ${sales.filter(s => s.seller_id === u.id).reduce((acc, s) => acc + (s.amount || 0), 0).toFixed(0)}
                </p>
                <p style={{ margin: 0, fontSize: '0.6rem', opacity: 0.4, textTransform: 'uppercase' }}>volumen</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TeamManager;
