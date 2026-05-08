import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dataService, TIERS } from '../../services/dataService';
import BadgeGrid, { BADGES_INFO } from '../badges/BadgeGrid';

const BASIC_BADGE_KEYS = ['FIRST_BLOOD', 'SAAS_STARTER', 'ACADEMY_LV1', 'GOLD_HAMMER', 'BRILLIANT_MIND', 'LEAD_HUNTER'];
const ELITE_BADGE_KEYS = ['PIONEER', 'RECURRING_LORD', 'VERIFIED_DIST', 'CORPORATE_CLOSER', 'SAAS_TITAN', 'CERTIFIED_MASTER'];

const TeamManager = ({ users, currentUser, onAddUser, sales, selectedSedeContext = 'GLOBAL' }) => {
  const canAddMembers = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'DISTRIBUTOR';
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [memberBadges, setMemberBadges] = useState({});
  const [subTab, setSubTab] = useState('network'); // 'network' o 'badges'
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const [agentPage, setAgentPage] = useState(1);
  const [showSocialDetails, setShowSocialDetails] = useState(false);

  const toggleExpand = async (userId) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
    } else {
      setExpandedUserId(userId);
      if (!memberBadges[userId]) {
        try {
          const badges = await dataService.getUserBadges(userId);
          setMemberBadges(prev => ({ ...prev, [userId]: badges }));
        } catch (e) {
          console.error("Error loading user badges:", e);
        }
      }
    }
  };

  const handleToggleBadge = async (userId, badgeKey) => {
    const current = memberBadges[userId] || [];
    const updated = current.includes(badgeKey)
      ? current.filter(b => b !== badgeKey)
      : [...current, badgeKey];
    
    setMemberBadges(prev => ({ ...prev, [userId]: updated }));
    try {
      await dataService.saveUserBadges(userId, updated);
    } catch (e) {
      console.error("Error saving user badges:", e);
    }
  };

  // Firebase uses uid, fallback to id for compatibility
  const currentUid = currentUser?.uid || currentUser?.id;

  // Si es Super Admin, ve a todos. Si es Distribuidor, solo a sus hijos.
  // Adicionalmente filtramos por la Sede/país activo si no estamos en la vista global.
  const myTeam = (currentUser?.role === 'SUPER_ADMIN' 
    ? users.filter(u => u.id !== currentUid) // Ver todos menos a sí mismo
    : users.filter(u => u.parent_id === currentUid)
  ).filter(u => {
    if (selectedSedeContext === 'GLOBAL') return true;
    const expectedSedeId = selectedSedeContext === 'Venezuela' ? 'sede-ve-1' : 'sede-ec-1';
    return u.sede_asignada === expectedSedeId;
  });

  const teamIds = myTeam.map(u => u.id);
  const teamSales = sales.filter(s => teamIds.includes(s.seller_id));
  const teamVolume = teamSales.reduce((acc, s) => acc + (s.amount || 0), 0);
  const totalNetworkCommissions = myTeam.reduce((acc, u) => acc + (u.wallet_balance || 0), 0) + (currentUser?.role === 'DISTRIBUTOR' ? (currentUser?.wallet_balance || 0) : 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let activeSedeId = null;
      if (currentUser?.role === 'SUPER_ADMIN') {
        activeSedeId = selectedSedeContext === 'Venezuela' ? 'sede-ve-1' : selectedSedeContext === 'Ecuador' ? 'sede-ec-1' : null;
      } else {
        activeSedeId = currentUser?.sede_asignada || null;
      }
      const userData = {
        name: e.target.name.value,
        email: e.target.email.value,
        role: e.target.role?.value || 'SELLER',
        tier: e.target.tier?.value || null,
        parent_id: currentUid,
        sede_asignada: activeSedeId
      };
      const newUser = await dataService.addTeamMember(currentUid, userData);
      
      // Otorgar insignia de Distribuidor Verificado automáticamente si el Super Admin lo crea con sede
      if (currentUser?.role === 'SUPER_ADMIN' && userData.role === 'DISTRIBUTOR' && activeSedeId) {
        try {
          const uid = newUser.id || newUser.uid;
          if (uid) {
            await dataService.saveUserBadges(uid, ['VERIFIED_DIST']);
          }
        } catch(e) {
          console.error("Error auto-assigning badge:", e);
        }
      }

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
      autoTable(doc, {
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
      {/* Encabezado Principal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.4rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
          {currentUser?.role === 'SUPER_ADMIN' ? 'Panel de Control' : 'Gestión de Red'}
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(subTab === 'network' || currentUser?.role !== 'SUPER_ADMIN') && (
            <>
              <button onClick={generatePDF} className="btn glass" style={{ width: '44px', height: '44px', padding: 0 }} aria-label="Descargar PDF">
                <Download size={18} />
              </button>
              {canAddMembers && (
                <button onClick={() => setIsAdding(!isAdding)} className="btn btn-primary" aria-label="Agregar vendedor" style={{ textTransform: 'uppercase', fontSize: '0.8rem' }}>
                  <UserPlus size={18} /> Crear Nuevo
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sub-Navegación Exclusiva para Super Admin */}
      {currentUser?.role === 'SUPER_ADMIN' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '2rem', padding: '4px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <button 
            onClick={() => setSubTab('network')} 
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '1px',
              background: subTab === 'network' ? 'var(--accent)' : 'transparent',
              color: subTab === 'network' ? 'var(--bg-primary)' : 'rgba(255,255,255,0.6)',
              fontWeight: 700, transition: 'all 0.2s ease'
            }}
          >
            Agentes / Red
          </button>
          <button 
            onClick={() => setSubTab('badges')} 
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '1px',
              background: subTab === 'badges' ? 'var(--accent)' : 'transparent',
              color: subTab === 'badges' ? 'var(--bg-primary)' : 'rgba(255,255,255,0.6)',
              fontWeight: 700, transition: 'all 0.2s ease'
            }}
          >
            Insignias / Logros
          </button>
        </div>
      )}

      {/* RENDERIZADO DE SUB-PESTAÑAS */}
      {(subTab === 'network' || currentUser?.role !== 'SUPER_ADMIN') ? (
        <>
          {/* Volumen grupal — solo para Admin y Distribuidor */}
          {currentUser?.role !== 'SELLER' && (
            <div 
              className="card glass" 
              onClick={() => setShowSocialDetails(!showSocialDetails)}
              style={{ 
                marginBottom: '2.5rem', 
                border: '1px solid var(--success)', 
                background: 'linear-gradient(135deg, var(--bg-secondary) 0%, rgba(0,255,157,0.05) 100%)',
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,255,157,0.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '2px', opacity: 0.8, margin: 0 }}>Volumen Grupal de Red</p>
                <p style={{ fontSize: '0.6rem', color: 'var(--success)', fontWeight: 700, margin: 0 }}>{showSocialDetails ? '▼ OCULTAR DETALLES' : '▲ VER DESGLOSE DE FONDOS'}</p>
              </div>
              <h2 style={{ margin: '8px 0', color: 'var(--success)', fontSize: '2rem', textShadow: '0 0 10px rgba(0,255,157,0.3)' }}>${teamVolume.toFixed(2)}</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                  <p style={{ fontSize: '0.8rem', opacity: 0.7, margin: 0 }}>Miembros activos: {myTeam.length}</p>
                  <div style={{ padding: '4px 12px', background: 'rgba(0,255,157,0.1)', borderRadius: '100px', fontSize: '0.65rem', color: 'var(--success)', fontWeight: 700 }}>LIVE</div>
              </div>

              {/* Expanded Social Responsibility Breakdown Accordion */}
              {showSocialDetails && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.3 }}
                  style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(0,255,157,0.2)', textAlign: 'left' }}
                  onClick={e => e.stopPropagation()} // Evitar que colapse el card al hacer clic dentro
                >
                  <p style={{ fontSize: '0.75rem', lineHeight: '1.4', opacity: 0.8, color: 'white', background: 'rgba(0,255,157,0.03)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid var(--success)', marginBottom: '1.2rem' }}>
                    <strong>Responsabilidad Social:</strong> Connexo destina el <strong>10%</strong> del total de la venta de cualquier plan PRO o ULTRA a la <strong>Fundación Arupo</strong> para impulsar el desarrollo tecnológico comunitario.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Fundación Arupo (10%)</span>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--success)' }}>${(teamVolume * 0.10).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Comisiones de Red (Vendedores/Dist.)</span>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>${totalNetworkCommissions.toFixed(2)}</strong>
                    </div>
                    {currentUser?.role === 'SUPER_ADMIN' && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(0,255,157,0.05)', borderRadius: '8px', border: '1px solid rgba(0,255,157,0.1)' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'white' }}>Neto para Connexo</span>
                        <strong style={{ fontSize: '0.85rem', color: 'white' }}>
                          ${Math.max(0, teamVolume - (teamVolume * 0.10) - totalNetworkCommissions).toFixed(2)}
                        </strong>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
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
                <div key={u.id} className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div 
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', width: '100%' }}
                  >
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
                                tier_start_date: newTier ? new Date().toISOString() : null
                              };
                              await dataService.updateProfile(u.id, updates);
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
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
                          ${sales.filter(s => s.seller_id === u.id).reduce((acc, s) => acc + (s.amount || 0), 0).toFixed(0)}
                        </p>
                        <p style={{ margin: 0, fontSize: '0.6rem', opacity: 0.4, textTransform: 'uppercase' }}>volumen</p>
                      </div>
                      {currentUser?.role === 'SUPER_ADMIN' && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm(`¿Estás seguro de eliminar permanentemente a ${u.full_name || u.name}? Esta acción no se puede deshacer.`)) {
                              try {
                                await dataService.deleteTeamMember(u.id);
                                alert("Usuario eliminado correctamente.");
                                window.location.reload();
                              } catch (err) {
                                alert("Error al eliminar usuario: " + err.message);
                              }
                            }
                          }}
                          style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--danger)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.6rem', cursor: 'pointer', marginTop: '2px' }}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        /* PESTAÑA DEDICADA EXCLUSIVA PARA INSIGNIAS */
        <div className="fade-in">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}>Buscar Agente (Vendedor / Distribuidor)</label>
            <input 
              value={agentSearchQuery}
              onChange={(e) => { setAgentSearchQuery(e.target.value); setAgentPage(1); }}
              placeholder="🔍 Buscar por nombre o email..."
              style={{ width: '100%', padding: '12px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '10px', fontSize: '0.85rem' }}
            />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              {(() => {
                const filteredAgents = myTeam.filter(u => {
                  const q = agentSearchQuery.toLowerCase();
                  return (u.full_name || u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
                });

                const AGENTS_PER_PAGE = 3;
                const totalAgentPages = Math.ceil(filteredAgents.length / AGENTS_PER_PAGE);
                const paginatedAgents = filteredAgents.slice((agentPage - 1) * AGENTS_PER_PAGE, agentPage * AGENTS_PER_PAGE);

                if (filteredAgents.length === 0) {
                  return <p style={{ textAlign: 'center', opacity: 0.4, fontSize: '0.8rem', padding: '1rem' }}>No se encontraron agentes coincidentes.</p>;
                }

                return (
                  <>
                    {paginatedAgents.map(u => {
                      const isSelected = selectedAgentId === u.id;
                      const badgeCount = (memberBadges[u.id] || []).length;
                      return (
                        <div
                          key={u.id}
                          onClick={async () => {
                            setSelectedAgentId(isSelected ? '' : u.id);
                            if (u.id && !memberBadges[u.id]) {
                              try {
                                const badges = await dataService.getUserBadges(u.id);
                                setMemberBadges(prev => ({ ...prev, [u.id]: badges }));
                              } catch (err) {
                                console.error("Error loading badges:", err);
                              }
                            }
                          }}
                          className="card glass"
                          style={{
                            display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                            cursor: 'pointer', border: isSelected ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.05)',
                            background: isSelected ? 'linear-gradient(135deg, rgba(255,102,0,0.08) 0%, rgba(255,255,255,0.02) 100%)' : 'rgba(255,255,255,0.01)',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: isSelected ? 'rgba(255,102,0,0.15)' : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent)', fontSize: '0.85rem' }}>
                            {(u.full_name || u.name || 'U').charAt(0)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'white' }}>{u.full_name || u.name}</p>
                            <p style={{ margin: 0, fontSize: '0.65rem', opacity: 0.5 }}>{u.role === 'SELLER' ? 'Vendedor' : 'Distribuidor'} · {u.email}</p>
                            {(() => {
                              const parentProfile = users.find(x => x.id === u.parent_id) || ((currentUser?.id === u.parent_id || currentUser?.uid === u.parent_id) ? currentUser : null);
                              if (parentProfile && parentProfile.role === 'DISTRIBUTOR') {
                                return (
                                  <p style={{ margin: '4px 0 0 0', fontSize: '0.6rem', color: 'var(--accent)', fontWeight: 'bold' }}>
                                    Red de: {parentProfile.full_name || parentProfile.name}
                                  </p>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <div style={{ padding: '4px 8px', background: isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.05)', color: isSelected ? 'var(--bg-primary)' : 'white', borderRadius: '100px', fontSize: '0.65rem', fontWeight: 700 }}>
                            🏅 {badgeCount} / 12
                          </div>
                        </div>
                      );
                    })}

                    {totalAgentPages > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0 0' }}>
                        <button
                          disabled={agentPage === 1}
                          onClick={() => setAgentPage(prev => Math.max(prev - 1, 1))}
                          className="btn glass"
                          style={{ fontSize: '0.6rem', padding: '4px 10px', height: 'auto', opacity: agentPage === 1 ? 0.3 : 1 }}
                        >
                          Anterior
                        </button>
                        <span style={{ fontSize: '0.65rem', opacity: 0.6 }}>Pág. {agentPage} de {totalAgentPages}</span>
                        <button
                          disabled={agentPage === totalAgentPages}
                          onClick={() => setAgentPage(prev => Math.min(prev + 1, totalAgentPages))}
                          className="btn glass"
                          style={{ fontSize: '0.6rem', padding: '4px 10px', height: 'auto', opacity: agentPage === totalAgentPages ? 0.3 : 1 }}
                        >
                          Siguiente
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {selectedAgentId ? (
            (() => {
              const selectedAgent = myTeam.find(u => u.id === selectedAgentId);
              const activeCount = (memberBadges[selectedAgentId] || []).length;
              return (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
                >
                  {/* Resumen de Perfil del Miembro */}
                  <div className="card glass" style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '16px', background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,102,0,0.05) 100%)', border: '1px solid rgba(255,102,0,0.1)' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(255,102,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
                      {(selectedAgent?.full_name || selectedAgent?.name || 'U').charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', color: 'white' }}>{selectedAgent?.full_name || selectedAgent?.name}</h4>
                      <p style={{ margin: '2px 0 0', fontSize: '0.75rem', opacity: 0.6 }}>{selectedAgent?.email}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-block', padding: '4px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: '100px', fontSize: '0.7rem', color: 'white', fontWeight: 600 }}>
                        🏅 {activeCount} / 12
                      </div>
                    </div>
                  </div>

                  {/* Panel Administrador de Insignias */}
                  <div className="card glass" style={{ padding: '20px 16px' }}>
                    <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', margin: '0 0 10px', fontWeight: 700 }}>Insignias de Inicio (Básicas)</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                      {BASIC_BADGE_KEYS.map((badgeKey) => {
                        const badge = BADGES_INFO[badgeKey];
                        if (!badge) return null;
                        const isUnlocked = (memberBadges[selectedAgentId] || []).includes(badgeKey);
                        return (
                          <div 
                            key={badgeKey} 
                            onClick={() => handleToggleBadge(selectedAgentId, badgeKey)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                              background: isUnlocked ? (badge.color + '22') : 'rgba(255,255,255,0.02)', 
                              borderRadius: '10px', cursor: 'pointer',
                              border: isUnlocked ? `1px solid ${badge.borderColor || '#C0C0C0'}` : '1px solid rgba(255,255,255,0.05)',
                              boxShadow: isUnlocked ? `0 0 8px ${badge.color}33` : 'none',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <div style={{ fontSize: '1.4rem', filter: isUnlocked ? 'none' : 'grayscale(100%) opacity(0.3)', flexShrink: 0, transition: 'all 0.2s ease' }}>
                              {badge.icon}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: isUnlocked ? 'white' : 'rgba(255,255,255,0.35)', whiteSpace: 'pre-line', lineHeight: '1.1', transition: 'all 0.2s ease' }}>{badge.title}</p>
                              <p style={{ margin: '3px 0 0', fontSize: '0.6rem', opacity: isUnlocked ? 0.6 : 0.3 }}>{isUnlocked ? 'Activada' : 'Bloqueada'}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--accent)', letterSpacing: '1px', margin: '0 0 10px', fontWeight: 700 }}>Insignias de Élite (Avanzadas)</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {ELITE_BADGE_KEYS.map((badgeKey) => {
                        const badge = BADGES_INFO[badgeKey];
                        if (!badge) return null;
                        const isUnlocked = (memberBadges[selectedAgentId] || []).includes(badgeKey);
                        return (
                          <div 
                            key={badgeKey} 
                            onClick={() => handleToggleBadge(selectedAgentId, badgeKey)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                              background: isUnlocked ? (badge.color + '22') : 'rgba(255,255,255,0.02)', 
                              borderRadius: '10px', cursor: 'pointer',
                              border: isUnlocked ? `1px solid ${badge.borderColor || '#FFD700'}` : '1px solid rgba(255,255,255,0.05)',
                              boxShadow: isUnlocked ? `0 0 8px ${badge.borderColor}44` : 'none',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <div style={{ fontSize: '1.4rem', filter: isUnlocked ? 'none' : 'grayscale(100%) opacity(0.3)', flexShrink: 0, transition: 'all 0.2s ease' }}>
                              {badge.icon}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: isUnlocked ? 'white' : 'rgba(255,255,255,0.35)', whiteSpace: 'pre-line', lineHeight: '1.1', transition: 'all 0.2s ease' }}>{badge.title}</p>
                              <p style={{ margin: '3px 0 0', fontSize: '0.6rem', opacity: isUnlocked ? 0.6 : 0.3 }}>{isUnlocked ? 'Activada' : 'Bloqueada'}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              );
            })()
          ) : (
            <div style={{ textAlign: 'center', opacity: 0.4, padding: '4rem 2rem', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
              <div style={{ fontSize: '2.5rem' }}>🏅</div>
              <p>Selecciona un distribuidor o vendedor de la lista para gestionar y activar sus insignias de logro de manera directa.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TeamManager;
