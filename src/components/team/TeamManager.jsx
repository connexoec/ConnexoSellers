import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dataService, TIERS } from '../../services/dataService';
import BadgeGrid, { BADGES_INFO } from '../badges/BadgeGrid';

const BASIC_BADGE_KEYS = ['FIRST_BLOOD', 'SAAS_STARTER', 'ACADEMY_LV1', 'GOLD_HAMMER', 'BRILLIANT_MIND', 'LEAD_HUNTER'];
const ELITE_BADGE_KEYS = ['PIONEER', 'RECURRING_LORD', 'VERIFIED_DIST', 'CORPORATE_CLOSER', 'SAAS_TITAN', 'CERTIFIED_MASTER'];

const TeamManager = ({ users, currentUser, onAddUser, sales }) => {
  const canAddMembers = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'DISTRIBUTOR';
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [memberBadges, setMemberBadges] = useState({});
  const [subTab, setSubTab] = useState('network'); // 'network' o 'badges'
  const [selectedAgentId, setSelectedAgentId] = useState('');

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
            👥 Agentes / Red
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
            🏅 Insignias / Logros
          </button>
        </div>
      )}

      {/* RENDERIZADO DE SUB-PESTAÑAS */}
      {(subTab === 'network' || currentUser?.role !== 'SUPER_ADMIN') ? (
        <>
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
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
                        ${sales.filter(s => s.seller_id === u.id).reduce((acc, s) => acc + (s.amount || 0), 0).toFixed(0)}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.6rem', opacity: 0.4, textTransform: 'uppercase' }}>volumen</p>
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
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '8px', fontWeight: 700 }}>Seleccionar Miembro de Red</label>
            <select
              value={selectedAgentId}
              onChange={async (e) => {
                const uid = e.target.value;
                setSelectedAgentId(uid);
                if (uid && !memberBadges[uid]) {
                  try {
                    const badges = await dataService.getUserBadges(uid);
                    setMemberBadges(prev => ({ ...prev, [uid]: badges }));
                  } catch (err) {
                    console.error("Error loading user badges:", err);
                  }
                }
              }}
              style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.03)', color: 'white',
                border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                fontSize: '0.9rem', outline: 'none', transition: 'all 0.2s'
              }}
            >
              <option value="" style={{ background: 'var(--bg-primary)' }}>-- Elige un distribuidor o vendedor --</option>
              {myTeam.map(u => (
                <option key={u.id} value={u.id} style={{ background: 'var(--bg-primary)' }}>
                  👤 {u.full_name || u.name} ({u.role === 'SELLER' ? 'Vendedor' : 'Distribuidor'})
                </option>
              ))}
            </select>
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
                              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 8px',
                              background: 'rgba(255,255,255,0.02)', borderRadius: '10px', cursor: 'pointer',
                              border: isUnlocked ? '1px solid var(--accent-glow)' : '1px solid transparent',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <div style={{ fontSize: '1.2rem', filter: isUnlocked ? 'none' : 'grayscale(100%) opacity(0.4)', flexShrink: 0 }}>
                              {badge.icon}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: isUnlocked ? 'white' : '#888', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{badge.title}</p>
                            </div>
                            <div style={{
                              width: '32px', height: '18px', borderRadius: '100px',
                              background: isUnlocked ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                              position: 'relative', transition: 'all 0.2s ease', flexShrink: 0
                            }}>
                              <div style={{
                                width: '12px', height: '12px', borderRadius: '50%', background: 'white',
                                position: 'absolute', top: '3px', left: isUnlocked ? '17px' : '3px',
                                transition: 'all 0.2s ease'
                              }} />
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
                              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 8px',
                              background: 'rgba(255,255,255,0.02)', borderRadius: '10px', cursor: 'pointer',
                              border: isUnlocked ? '1px solid var(--accent-glow)' : '1px solid transparent',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <div style={{ fontSize: '1.2rem', filter: isUnlocked ? 'none' : 'grayscale(100%) opacity(0.4)', flexShrink: 0 }}>
                              {badge.icon}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: isUnlocked ? 'white' : '#888', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{badge.title}</p>
                            </div>
                            <div style={{
                              width: '32px', height: '18px', borderRadius: '100px',
                              background: isUnlocked ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                              position: 'relative', transition: 'all 0.2s ease', flexShrink: 0
                            }}>
                              <div style={{
                                width: '12px', height: '12px', borderRadius: '50%', background: 'white',
                                position: 'absolute', top: '3px', left: isUnlocked ? '17px' : '3px',
                                transition: 'all 0.2s ease'
                              }} />
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
