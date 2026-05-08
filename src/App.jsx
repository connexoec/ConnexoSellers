import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav    from './components/layout/BottomNav';
import Header       from './components/layout/Header';
import Login        from './components/auth/Login';
import TeamManager  from './components/team/TeamManager';
import Onboarding   from './components/onboarding/Onboarding';
import SaleForm     from './components/sales/SaleForm';
import Academy      from './components/academy/Academy';
import InventoryManager from './components/inventory/InventoryManager';
import { dataService, PLANS } from './services/dataService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import BadgeGrid from './components/badges/BadgeGrid';

const SESSION_KEY = 'connexo_session';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading,       setIsLoading]       = useState(true);   // true al inicio para restaurar sesión
  const [activeTab,       setActiveTab]       = useState(() => {
    return localStorage.getItem('connexo_active_tab') || 'dashboard';
  });
  const [user,            setUser]            = useState(null);
  const [team,            setTeam]            = useState([]);
  const [sales,           setSales]           = useState([]);
  const [showOnboarding,  setShowOnboarding]  = useState(false);
  const [selectedPlan,    setSelectedPlan]    = useState(null);
  const [metrics,         setMetrics]         = useState({ rate: 0, base: 0, level: 'CARGANDO...' });
  const [notifications,   setNotifications]   = useState([
    { id: 1, message: 'Ecosistema Connexo v2.2 iniciado', type: 'INFO', read: false }
  ]);
  const [highContrast,    setHighContrast]    = useState(false);
  const [userBadges,      setUserBadges]      = useState([]);
  const [searchQuery,     setSearchQuery]     = useState('');
  const [planFilter,      setPlanFilter]      = useState('ALL');
  const [currentPage,     setCurrentPage]     = useState(1);
  const [expandedSaleId,  setExpandedSaleId]  = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editedName,      setEditedName]      = useState('');
  const [editedEmail,     setEditedEmail]     = useState('');
  const [selectedSedeContext, setSelectedSedeContext] = useState(() => {
    return localStorage.getItem('connexo_selected_sede_context') || 'GLOBAL';
  });
  const [sedes, setSedes] = useState([]);
  const [showSedesModal, setShowSedesModal] = useState(false);
  const [newSedeName, setNewSedeName] = useState('');
  const [newSedePais, setNewSedePais] = useState('Ecuador');
  const [selectedDistributorId, setSelectedDistributorId] = useState('');
  const [parentDistributorName, setParentDistributorName] = useState('');
  // Guardar contexto activo de sede en localStorage
  useEffect(() => {
    localStorage.setItem('connexo_selected_sede_context', selectedSedeContext);
  }, [selectedSedeContext]);

  // ── Guardar pestaña activa al cambiar ───────────────────────────
  useEffect(() => {
    localStorage.setItem('connexo_active_tab', activeTab);
  }, [activeTab]);

  // ── Restaurar sesión al recargar ──────────────────────────────────────
  useEffect(() => {
    const restoreSession = async () => {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        try {
          const savedUser = JSON.parse(saved);
          if (savedUser) {
            // LOGIN OPTIMISTA INSTANTÁNEO: Autenticar inmediatamente usando caché local
            setUser(savedUser);
            setIsAuthenticated(true);
            setShowOnboarding(false);

            // Intentar enriquecer los datos desde Supabase en background sin bloquear
            try {
              const { data: freshProfile, error } = await import('./lib/supabase').then(m =>
                m.supabase.from('profiles').select('*').eq('id', savedUser.id || savedUser.uid).single()
              );
              if (!error && freshProfile) {
                const localAvatar = localStorage.getItem(`connexo_avatar_${savedUser.id || savedUser.uid}`);
                const updatedUser = {
                  ...savedUser,
                  ...freshProfile,
                  avatar_url: freshProfile.avatar_url || localAvatar || savedUser.avatar_url
                };
                setUser(updatedUser);
                localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
                refreshData(updatedUser);
              } else {
                refreshData(savedUser);
              }
            } catch (netErr) {
              console.warn("Fetch fresh profile failed, keeping local session active:", netErr);
              refreshData(savedUser);
            }
          }
        } catch (parseError) {
          console.error("Critical error parsing session cache:", parseError);
          localStorage.removeItem(SESSION_KEY);
        }
      }
      setIsLoading(false);
    };
    restoreSession();
  }, []);

  const refreshData = async (currentUser = user) => {
    if (!currentUser) return;
    const uid = currentUser.uid || currentUser.id;
    const role = currentUser.role;
    try {
      const [newMetrics, teamData, salesData, badges] = await Promise.all([
        dataService.getMetrics(currentUser).catch(e => {
          console.warn("Metrics error:", e);
          return { rate: 0, base: 0, level: role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : 'CARGANDO...' };
        }),
        (role === 'SUPER_ADMIN'
          ? dataService.getAllProfiles()
          : role === 'DISTRIBUTOR'
            ? dataService.getTeam(uid)
            : Promise.resolve([])
        ).catch(e => {
          console.warn("Profiles/Team error:", e);
          return [];
        }),
        (role === 'SELLER'
          ? dataService.getSales(uid)
          : dataService.getSalesForTeam(uid, role)
        ).catch(e => {
          console.warn("Sales error:", e);
          return [];
        }),
        dataService.getUserBadges(uid).catch(e => {
          console.warn("Badges error:", e);
          return [];
        })
      ]);
      setMetrics(newMetrics);
      setTeam(teamData || []);
      setSales(salesData || []);
      setUserBadges(badges || []);
      
      // Cargar Sedes para contexto multisede
      dataService.getSedes().then(data => setSedes(data)).catch(console.error);
      
      // Fetch parent distributor name for sellers
      if (role === 'SELLER' && currentUser.parent_id) {
        dataService.getProfile(currentUser.parent_id).then(p => {
          if (p && p.role === 'DISTRIBUTOR') {
            setParentDistributorName(p.full_name || p.name);
          }
        }).catch(console.error);
      }
      
      // Si es SUPER ADMIN, buscar pedidos pendientes y generar notificación
      if (role === 'SUPER_ADMIN') {
        const reqs = await dataService.getInventoryRequests(null);
        const pendingCount = reqs.filter(r => r.status === 'PENDING').length;
        if (pendingCount > 0) {
          setNotifications(prev => {
            const hasPendingNotif = prev.some(n => n.message.includes('pedidos pendientes'));
            if (!hasPendingNotif) {
              return [{ id: Date.now(), message: `Tienes ${pendingCount} pedidos pendientes de revisión en Inventario.`, type: 'INFO', read: false }, ...prev];
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error('Error al refrescar datos:', err);
    }
  };

  // --- Handlers ---
  const handleLogin = async (email, password, selectedRole) => {
    setIsLoading(true);
    try {
      const userData = await dataService.login(email, password, selectedRole);
      localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
      setUser(userData);
      setIsAuthenticated(true);
      setShowOnboarding(true);
      // Refrescar datos inmediatamente con el usuario recién cargado
      refreshData(userData);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminBypass = (adminUser) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(adminUser)); // 💾 Guardar sesión admin
    setUser(adminUser);
    setIsAuthenticated(true);
    setShowOnboarding(true);
  };

  const handleLogout = async () => {
    await dataService.logout();
    localStorage.removeItem(SESSION_KEY); // 🗑️ Limpiar sesión guardada
    localStorage.removeItem('connexo_active_tab'); // 🗑️ Limpiar pestaña guardada
    setIsAuthenticated(false);
    setUser(null);
    setSales([]);
    setTeam([]);
    setMetrics({ rate: 0, base: 0, level: 'CARGANDO...' });
    setActiveTab('dashboard');
    setShowOnboarding(false);
  };

  const handleRegisterSale = async (planKey, customerData, billingCycle = 'annually') => {
    setIsLoading(true);
    try {
      const activeSedeId = selectedSedeContext === 'Venezuela' ? 'sede-ve-1' : 'sede-ec-1';
      const newSale = await dataService.registerSale(
        user.uid || user.id,
        planKey,
        customerData,
        metrics.rate,
        user.is_certified,
        billingCycle,
        activeSedeId
      );
      // Actualizar estado local optimistamente (sin re-query)
      setSales(prev => [newSale, ...prev]);
      // Actualizar wallet en el user local
      const earned = newSale.commission_earned || 0;
      const updatedUser = { ...user, wallet_balance: (user.wallet_balance || 0) + earned };
      setUser(updatedUser);
      localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
      setSelectedPlan(null);
      addNotification(`Venta de ${customerData.name} registrada — +$${earned.toFixed(2)}`);
      // Recalcular métricas e historial completo de inmediato para refrescar la interfaz en tiempo real
      refreshData(updatedUser);

      // ─── Desbloquear Primera Insignia (FIRST_BLOOD) ─────────────────────────
      const hasFirstBlood = userBadges.includes('FIRST_BLOOD');
      if (!hasFirstBlood) {
        const updatedBadges = [...userBadges, 'FIRST_BLOOD'];
        setUserBadges(updatedBadges);
        await dataService.saveUserBadges(user.uid || user.id, updatedBadges);
        setTimeout(() => {
          alert("¡FELICIDADES! ¡Has concretado tu primera venta y desbloqueado tu primera insignia oficial: 'Primer Impacto'!");
        }, 800);
        addNotification("¡Has obtenido tu primera insignia oficial: Primer Impacto!", "SUCCESS");
      }
    } catch (err) {
      alert('Error al registrar venta: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const addNotification = (message, type = 'SUCCESS') => {
    setNotifications(prev => [{ id: Date.now(), message, type, read: false }, ...prev]);
  };

  if (isLoading && !isAuthenticated) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--accent)', fontFamily: 'var(--font-main)', padding: '2rem', textAlign: 'center', gap: '1.5rem' }}>
        <div style={{ width: 40, height: 40, border: '4px solid rgba(255,102,0,0.1)', borderTop: '4px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ letterSpacing: '2px', textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 600 }}>Iniciando Ecosistema...</p>
      </div>
    );
  }

  const getFilteredTeam = () => {
    if (selectedSedeContext === 'GLOBAL') return team;
    const isVenezuela = selectedSedeContext === 'Venezuela';
    return team.filter(t => {
      if (t.sede_asignada) {
        return isVenezuela ? t.sede_asignada === 'sede-ve-1' : t.sede_asignada === 'sede-ec-1';
      }
      return isVenezuela ? t.email?.includes('ve') : !t.email?.includes('ve');
    });
  };

  const getFilteredSales = () => {
    if (selectedSedeContext === 'GLOBAL') return sales;
    const expectedSedeId = selectedSedeContext === 'Venezuela' ? 'sede-ve-1' : 'sede-ec-1';
    return sales.filter(s => s.sede_id === expectedSedeId);
  };

  // --- Tab Content ---
  const renderContent = () => {
    switch (activeTab) {

      case 'dashboard': return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="slide-up" style={{ padding: '0 1.5rem 100px', fontFamily: 'var(--font-main)' }}>

          {/* Status Card */}
          {user?.role === 'SUPER_ADMIN' ? (
            <div className="card glass" style={{ marginBottom: '2rem', border: '1px solid var(--accent-glow)', background: 'linear-gradient(135deg, var(--bg-secondary) 0%, #2b1208 100%)' }}>
              <p style={{ fontSize: '0.6rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Control Maestro</p>
              <h2 style={{ color: 'var(--accent)', margin: '0', fontSize: '1.4rem', textShadow: '0 0 10px var(--accent-glow)' }}>
                {selectedSedeContext === 'GLOBAL' ? 'Vista Global de Red' : selectedSedeContext === 'Ecuador' ? 'Vista Ecuador' : 'Vista Venezuela'}
              </h2>

              <div style={{ marginTop: '20px', display: 'flex', gap: '20px' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.65rem', opacity: 0.8, margin: 0, textTransform: 'uppercase' }}>Vendedores</p>
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'white', margin: '4px 0 0' }}>
                    {getFilteredTeam().filter(t => t.role === 'SELLER').length}
                  </p>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.65rem', opacity: 0.8, margin: 0, textTransform: 'uppercase' }}>Distribuidores</p>
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'white', margin: '4px 0 0' }}>
                    {getFilteredTeam().filter(t => t.role === 'DISTRIBUTOR').length}
                  </p>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.65rem', opacity: 0.8, margin: 0, textTransform: 'uppercase' }}>Ventas ({selectedSedeContext})</p>
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent)', margin: '4px 0 0' }}>
                    {getFilteredSales().length}
                  </p>
                </div>
              </div>

              {/* Action Buttons: [Gestionar Sede] and [Exportar Reporte Global] */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '15px' }}>
                <button
                  onClick={() => setShowSedesModal(true)}
                  className="btn glass"
                  style={{ flex: 1, fontSize: '0.7rem', padding: '8px 12px', height: 'auto', border: '1px solid var(--accent)' }}
                  aria-label="Gestionar Sedes del Ecosistema"
                >
                  🏢 Gestionar Sede
                </button>
                <button
                  onClick={() => {
                    try {
                      // Consolidado Global Report Export
                      const totalEcuadorSales = sales.filter(s => s.sede_id === 'sede-ec-1').length;
                      const totalVenezuelaSales = sales.filter(s => s.sede_id === 'sede-ve-1').length;
                      const totalEcuRevenue = sales.filter(s => s.sede_id === 'sede-ec-1').reduce((a, b) => a + (b.amount || 0), 0);
                      const totalVenRevenue = sales.filter(s => s.sede_id === 'sede-ve-1').reduce((a, b) => a + (b.amount || 0), 0);

                      const doc = new jsPDF();
                      doc.setFont('helvetica');
                      doc.setFontSize(16);
                      doc.text('CONSOLIDADO GLOBAL MULTISEDE - CONNEXO', 14, 20);
                      
                      doc.setFontSize(11);
                      doc.text(`Fecha del Reporte: ${new Date().toLocaleString()}`, 14, 28);
                      doc.text(`Admin Ejecutante: ${user?.email}`, 14, 34);

                      autoTable(doc, {
                        startY: 40,
                        head: [['Sede', 'País', 'Transacciones', 'Volumen de Ventas']],
                        body: [
                          ['Sede Quito', 'Ecuador', totalEcuadorSales, `$${totalEcuRevenue.toFixed(2)}`],
                          ['Sede Caracas', 'Venezuela', totalVenezuelaSales, `$${totalVenRevenue.toFixed(2)}`],
                          ['Total Consolidado', 'Global', sales.length, `$${sales.reduce((a, b) => a + (b.amount || 0), 0).toFixed(2)}`]
                        ],
                        theme: 'striped',
                        headStyles: { fillColor: [249, 115, 22] }
                      });

                      doc.save('reporte_global_connexo.pdf');
                      addNotification('Reporte Consolidado Exportado con éxito', 'SUCCESS');
                    } catch (err) {
                      console.error('Error al exportar reporte global:', err);
                      alert('Error al generar el Reporte Consolidado.');
                    }
                  }}
                  className="btn btn-primary"
                  style={{ flex: 1, fontSize: '0.7rem', padding: '8px 12px', height: 'auto' }}
                  aria-label="Exportar Reporte Consolidado Global"
                >
                  📊 Exportar Reporte Global
                </button>
              </div>
            </div>
          ) : (
            <div className="card glass" style={{ marginBottom: '2rem', border: '1px solid var(--accent-glow)', background: 'linear-gradient(135deg, var(--bg-secondary) 0%, #2b1208 100%)' }}>
              <p style={{ fontSize: '0.6rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Estatus de Agente</p>
              <h2 style={{ color: 'var(--accent)', margin: '0', fontSize: '1.4rem', textShadow: '0 0 10px var(--accent-glow)' }}>{metrics.level}</h2>
              
              <div style={{ margin: '20px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <p style={{ fontSize: '0.65rem', opacity: 0.8 }}>Progreso de Nivel</p>
                  <p style={{ fontSize: '0.65rem', color: 'var(--accent)' }}>{Math.min(sales.length, 100)}%</p>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(sales.length, 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    style={{ height: '100%', background: 'linear-gradient(90deg, var(--accent-dark), var(--accent))', boxShadow: '0 0 10px var(--accent-glow)' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: user?.is_certified ? 'var(--success)' : 'var(--danger)', boxShadow: `0 0 10px ${user?.is_certified ? 'var(--success)' : 'var(--danger)'}` }} />
                 <p style={{ fontSize: '0.7rem', fontWeight: 700, color: user?.is_certified ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-heading)', margin: 0 }}>
                   {user?.is_certified ? 'CERTIFICADO CONNEXO' : 'CERTIFICACIÓN PENDIENTE'}
                 </p>
              </div>
            </div>
          )}

          {/* Stats Grid — único, contextualizado por rol */}
          {user?.role !== 'SUPER_ADMIN' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '2.5rem' }}>
              <div className="card glass" style={{ borderLeft: '3px solid var(--accent)' }}>
                <p style={{ fontSize: '0.55rem', opacity: 0.5, letterSpacing: '1px' }}>BILLETERA</p>
                <h3 style={{ margin: '4px 0', fontSize: '1.25rem', color: 'white' }}>${(user?.wallet_balance || 0).toFixed(2)}</h3>
              </div>
              <div className="card glass" style={{ borderLeft: '3px solid var(--success)' }}>
                <p style={{ fontSize: '0.55rem', opacity: 0.5, letterSpacing: '1px' }}>
                  SUELDO BASE {metrics.isPreview && <span style={{ opacity: 0.4 }}>🔒</span>}
                </p>
                <h3 style={{ margin: '4px 0', fontSize: '1.25rem', color: metrics.base > 0 ? 'var(--success)' : 'rgba(255,255,255,0.3)' }}>${metrics.base.toFixed(0)}</h3>
              </div>
              <div className="card glass" style={{ borderLeft: `3px solid ${metrics.rate > 0 ? 'var(--accent)' : 'rgba(255,255,255,0.3)'}`, position: 'relative' }}>
                <p style={{ fontSize: '0.55rem', opacity: 0.5, letterSpacing: '1px' }}>COMISIÓN</p>
                <h3 style={{ margin: '4px 0', fontSize: '1.25rem', color: 'var(--accent)' }}>{(metrics.rate * 100).toFixed(0)}%</h3>
                {metrics.isPreview && (
                  <span style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '0.5rem', background: 'rgba(255,102,0,0.15)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '100px', fontWeight: 700 }}>
                    OBJETIVO
                  </span>
                )}
              </div>
              <div className="card glass" style={{ borderLeft: '3px solid white' }}>
                <p style={{ fontSize: '0.55rem', opacity: 0.5, letterSpacing: '1px' }}>
                  {user?.role === 'SELLER' ? 'MIS VENTAS' : 'VENTAS RED'}
                </p>
                <h3 style={{ margin: '4px 0', fontSize: '1.25rem', color: 'white' }}>{sales.length}</h3>
              </div>
            </div>
          )}

          {/* Sales Feed / Customer DB */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', opacity: 0.7, letterSpacing: '1px', margin: 0 }}>
              {user?.role === 'SUPER_ADMIN' || user?.role === 'DISTRIBUTOR' ? 'Base de Clientes & Activaciones' : 'Mis Ventas'}
            </h3>
            {user?.role === 'SUPER_ADMIN' || user?.role === 'DISTRIBUTOR' ? (
              <button 
                onClick={() => {
                  try {
                    const doc = new jsPDF();
                    doc.setFont('helvetica');
                    doc.text(`Base de Clientes - ${user?.role === 'SUPER_ADMIN' ? 'Red Completa' : 'Mi Equipo'}`, 14, 20);
                    
                    const groupedSales = sales.reduce((acc, sale) => {
                      const plan = sale.plan_type || 'Otros';
                      if (!acc[plan]) acc[plan] = [];
                      acc[plan].push(sale);
                      return acc;
                    }, {});

                    let currentY = 30;
                    Object.keys(groupedSales).forEach((plan, idx) => {
                      // Usar autoTable para calcular las posiciones automáticamente
                      doc.setFontSize(12);
                      doc.text(`Categoría: Plan ${plan}`, 14, currentY);
                      
                      autoTable(doc, {
                        startY: currentY + 5,
                        head: [['Cliente', 'Teléfono', 'Email', 'Vendedor', 'Fecha']],
                        body: groupedSales[plan].map(s => {
                          const seller = team.find(m => m.id === s.seller_id)?.full_name || 'Desconocido';
                          return [
                            s.customer_name || 'N/A',
                            s.customer_phone || 'N/A',
                            s.customer_email || 'N/A',
                            seller,
                            new Date(s.created_at).toLocaleDateString()
                          ];
                        }),
                        theme: 'striped',
                        headStyles: { fillColor: [255, 102, 0] }
                      });
                      currentY = doc.lastAutoTable.finalY + 15;
                    });
                    
                    doc.save('base_clientes_connexo.pdf');
                  } catch (err) {
                    console.error("Error generating PDF:", err);
                    alert("Error al generar el documento PDF.");
                  }
                }}
                className="btn glass" 
                style={{ fontSize: '0.65rem', padding: '4px 10px', height: 'auto', gap: '6px' }}
              >
                📥 Descargar PDF
              </button>
            ) : (
              <span style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 700 }}>
                Total: ${sales.reduce((a, s) => a + (s.amount || 0), 0).toFixed(2)}
              </span>
            )}
          </div>

          {/* Filters & Search for Super Admin and Distributors */}
          {(user?.role === 'SUPER_ADMIN' || user?.role === 'DISTRIBUTOR') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.2rem' }}>
              <input 
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="🔍 Buscar por nombre, email o teléfono..."
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '10px', fontSize: '0.8rem' }}
              />
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                {['ALL', 'LITE', 'PRO', 'ULTRA'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => { setPlanFilter(cat); setCurrentPage(1); }}
                    style={{
                      padding: '6px 12px', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 600,
                      border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'all 0.2s',
                      background: planFilter === cat ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                      color: planFilter === cat ? 'var(--bg-primary)' : 'rgba(255,255,255,0.6)'
                    }}
                  >
                    {cat === 'ALL' ? 'Todos' : cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sales Listing */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(() => {
              const filteredSales = sales.filter(s => {
                const matchesSede = selectedSedeContext === 'GLOBAL' ? true : (
                  s.sede_id === (selectedSedeContext === 'Venezuela' ? 'sede-ve-1' : 'sede-ec-1')
                );
                const matchesSearch = !searchQuery ? true : (
                  (s.customer_name && s.customer_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                  (s.customer_email && s.customer_email.toLowerCase().includes(searchQuery.toLowerCase())) ||
                  (s.customer_phone && s.customer_phone.includes(searchQuery))
                );
                const matchesPlan = planFilter === 'ALL' ? true : s.plan_type === planFilter;
                return matchesSede && matchesSearch && matchesPlan;
              });

              const ITEMS_PER_PAGE = 5;
              const totalPages = Math.ceil(filteredSales.length / ITEMS_PER_PAGE);
              const paginatedSales = filteredSales.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

              if (filteredSales.length === 0) {
                return (
                  <p style={{ textAlign: 'center', opacity: 0.4, fontSize: '0.8rem', padding: '2rem' }}>
                    No se encontraron registros coincidentes.
                  </p>
                );
              }

              return (
                <>
                  {paginatedSales.map(s => {
                    const sellerMember = user?.role !== 'SELLER' && team.find(m => m.id === s.seller_id);
                    const isExpanded = expandedSaleId === s.id;
                    
                    if (user?.role === 'SUPER_ADMIN' || user?.role === 'DISTRIBUTOR') {
                      return (
                        <div 
                          key={s.id} 
                          className="card glass" 
                          onClick={() => setExpandedSaleId(isExpanded ? null : s.id)}
                          style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '3px solid var(--accent)', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'white' }}>{s.customer_name || 'Cliente'}</p>
                              <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600 }}>{s.plan_type} · ${s.amount}</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ margin: 0, fontSize: '0.65rem', opacity: 0.5 }}>{new Date(s.created_at).toLocaleDateString()}</p>
                              <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Vendedor: {sellerMember?.full_name || 'N/A'}</p>
                            </div>
                          </div>

                          {/* Expandable details with accordion style */}
                          {isExpanded && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}
                              onClick={e => e.stopPropagation()}
                            >
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📞 {s.customer_phone || 'N/A'}</p>
                                <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✉️ {s.customer_email || 'N/A'}</p>
                                {s.customer_company && <p style={{ margin: 0, gridColumn: '1 / -1' }}>🏢 {s.customer_company}</p>}
                              </div>
                              {s.customer_notes && (
                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', fontStyle: 'italic', opacity: 0.8 }}>
                                  "{s.customer_notes}"
                                </div>
                              )}
                            </motion.div>
                          )}
                        </div>
                      );
                    }

                    // Vista normal para Vendedores y Distribuidores (Mis Ventas)
                    return (
                      <div key={s.id} className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.customer_name || 'Cliente'}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.65rem', opacity: 0.5 }}>
                            {s.plan_type} · {new Date(s.created_at).toLocaleDateString()}
                            {sellerMember && (
                              <span style={{ marginLeft: '6px', color: 'var(--accent)', fontWeight: 600 }}>
                                · {sellerMember.full_name || sellerMember.name}
                              </span>
                            )}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ margin: 0, color: 'var(--success)', fontWeight: 700, fontSize: '0.9rem' }}>+${(s.commission_earned || 0).toFixed(2)}</p>
                          <p style={{ margin: 0, fontSize: '0.6rem', opacity: 0.5 }}>${(s.amount || 0).toFixed(2)}</p>
                        </div>
                      </div>
                    );
                  })}

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.2rem', padding: '0 4px' }}>
                      <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        className="btn glass"
                        style={{ fontSize: '0.65rem', padding: '6px 12px', height: 'auto', opacity: currentPage === 1 ? 0.3 : 1 }}
                      >
                        ◀ Anterior
                      </button>
                      <span style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 600 }}>
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        className="btn glass"
                        style={{ fontSize: '0.65rem', padding: '6px 12px', height: 'auto', opacity: currentPage === totalPages ? 0.3 : 1 }}
                      >
                        Siguiente ▶
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </motion.div>
      );

      case 'sales': return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="slide-up" style={{ padding: '0 1.5rem 100px', fontFamily: 'var(--font-main)' }}>
          <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>Terminal de Ventas</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Seleccione el plan de suscripción para el cliente.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Plan PRO Card */}
            <div 
              className="card glass" 
              onClick={() => !isLoading && setSelectedPlan('PRO')}
              style={{ cursor: 'pointer', borderLeft: '4px solid var(--accent)', padding: '1.5rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="tier-badge tier-pro" style={{ marginBottom: '8px', display: 'inline-block' }}>PLAN PRO</span>
                  <h3 style={{ margin: '4px 0 12px', fontSize: '1.5rem' }}>Connexo Pro</h3>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>Ideal para negocios individuales y freelancers.</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.6rem', opacity: 0.5, textTransform: 'uppercase' }}>Precio</p>
                  <h3 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.4rem' }}>$97</h3>
                </div>
              </div>
            </div>

            {/* Plan ULTRA Card */}
            <div 
              className="card glass" 
              onClick={() => !isLoading && setSelectedPlan('ULTRA')}
              style={{ cursor: 'pointer', borderLeft: '4px solid var(--tier-ultra)', padding: '1.5rem', background: 'linear-gradient(135deg, rgba(189,0,255,0.05) 0%, rgba(43,18,8,0) 100%)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="tier-badge tier-ultra" style={{ marginBottom: '8px', display: 'inline-block' }}>PLAN ULTRA</span>
                  <h3 style={{ margin: '4px 0 12px', fontSize: '1.5rem' }}>Connexo Ultra</h3>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>Máxima potencia para empresas y agencias.</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.6rem', opacity: 0.5, textTransform: 'uppercase' }}>Precio</p>
                  <h3 style={{ margin: 0, color: 'var(--tier-ultra)', fontSize: '1.4rem' }}>$179</h3>
                </div>
              </div>
            </div>
          </div>

          {selectedPlan && (
            <SaleForm
              plan={PLANS[selectedPlan]}
              onConfirm={(data, billingCycle) => handleRegisterSale(selectedPlan, data, billingCycle)}
              onCancel={() => setSelectedPlan(null)}
            />
          )}
        </motion.div>
      );

      case 'network': return (
        <TeamManager
          users={team}
          currentUser={user}
          sales={sales}
          selectedSedeContext={selectedSedeContext}
          onAddUser={(newUser) => {
            setTeam(prev => [...prev, newUser]);
            addNotification(`${newUser.full_name || newUser.name} agregado al equipo`, 'SUCCESS');
          }}
        />
      );

      case 'academy': return (
        <Academy
          user={user}
          onCertify={async () => {
            try {
              await dataService.certifyUser(user.uid || user.id);
              // Actualizar estado local Y localStorage para que persista al recargar
              const updatedUser = { ...user, is_certified: true };
              setUser(updatedUser);
              localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
              addNotification('¡Certificación completada! Comisiones desbloqueadas.', 'SUCCESS');
              // Recalcular métricas en background
              dataService.getMetrics(updatedUser).then(m => setMetrics(m));
            } catch (err) {
              alert('Error: ' + err.message);
            }
          }}
        />
      );

      case 'inventory': return (
        <InventoryManager 
          user={user} 
          team={team}
          addNotification={addNotification} 
          selectedSedeContext={selectedSedeContext}
        />
      );

      case 'profile': return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="slide-up" style={{ padding: '2rem 1.5rem 100px', fontFamily: 'var(--font-main)', textAlign: 'center' }}>
          <div 
            onClick={() => document.getElementById('avatar-upload-input').click()}
            style={{ position: 'relative', width: 100, height: 100, margin: '0 auto 1.5rem', cursor: 'pointer' }}
            title="Haga clic para subir foto de perfil"
          >
            <div style={{ position: 'absolute', inset: -5, borderRadius: '50%', background: 'var(--accent)', opacity: 0.2, filter: 'blur(10px)' }} />
            <div style={{ 
              position: 'relative', width: '100%', height: '100%', borderRadius: '50%', 
              background: user?.avatar_url ? `url(${user.avatar_url}) center/cover no-repeat` : 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', 
              fontSize: user?.avatar_url ? '0' : '2.5rem', fontWeight: 900, color: 'var(--bg-primary)', 
              boxShadow: '0 0 20px var(--accent-glow)', overflow: 'hidden' 
            }}>
              {!user?.avatar_url && (user?.full_name || 'U').charAt(0).toUpperCase()}
            </div>
            {/* Floating Camera Badge */}
            <div style={{
              position: 'absolute', bottom: 0, right: 0, background: 'var(--accent)', borderRadius: '50%', width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-primary)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)', fontSize: '0.8rem'
            }}>
              📷
            </div>
            <input 
              id="avatar-upload-input"
              type="file" 
              accept="image/*" 
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onloadend = async () => {
                    const base64data = reader.result;
                    const uid = user.id || user.uid;
                    // Guardar de inmediato en almacenamiento local persistente
                    localStorage.setItem(`connexo_avatar_${uid}`, base64data);
                    try {
                      await dataService.updateProfile(uid, { avatar_url: base64data });
                      const updatedUser = { ...user, avatar_url: base64data };
                      setUser(updatedUser);
                      localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
                      addNotification("Foto de perfil actualizada", "SUCCESS");
                    } catch (err) {
                      // Fallback local
                      const updatedUser = { ...user, avatar_url: base64data };
                      setUser(updatedUser);
                      localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
                      addNotification("Foto de perfil guardada localmente", "SUCCESS");
                    }
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', margin: '1rem 0 0' }}>
            {isEditingProfile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '300px', margin: '0 auto' }}>
                <input 
                  type="text" 
                  value={editedName} 
                  onChange={e => setEditedName(e.target.value)} 
                  placeholder="Nombre completo"
                  style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center' }}
                />
                <input 
                  type="email" 
                  value={editedEmail} 
                  onChange={e => setEditedEmail(e.target.value)} 
                  placeholder="Correo electrónico"
                  style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px', fontSize: '0.9rem', textAlign: 'center' }}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '4px' }}>
                  <button 
                    onClick={async () => {
                      if (!editedName.trim() || !editedEmail.trim()) {
                        alert("Por favor completa todos los campos.");
                        return;
                      }
                      setIsLoading(true);
                      try {
                        const uid = user.id || user.uid;
                        await dataService.updateProfile(uid, { full_name: editedName, email: editedEmail });
                        const updatedUser = { ...user, full_name: editedName, email: editedEmail };
                        setUser(updatedUser);
                        localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
                        setIsEditingProfile(false);
                        addNotification("Perfil actualizado con éxito", "SUCCESS");
                      } catch (err) {
                        alert("Error actualizando perfil: " + err.message);
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                    className="btn btn-primary" 
                    style={{ fontSize: '0.7rem', padding: '6px 14px', height: 'auto' }}
                  >
                    Guardar
                  </button>
                  <button 
                    onClick={() => {
                      setIsEditingProfile(false);
                      setEditedName(user?.full_name || '');
                      setEditedEmail(user?.email || '');
                    }}
                    className="btn glass" 
                    style={{ fontSize: '0.7rem', padding: '6px 14px', height: 'auto' }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 style={{ textTransform: 'uppercase', fontSize: '1.4rem', fontFamily: 'var(--font-heading)', letterSpacing: '2px', margin: 0 }}>{user?.full_name}</h2>
                <p style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '4px', marginBottom: '8px' }}>{user?.email}</p>
                {user?.role === 'SELLER' && parentDistributorName && (
                  <div style={{ display: 'inline-block', margin: '4px auto 12px', padding: '4px 12px', background: 'rgba(255,102,0,0.1)', border: '1px solid var(--accent)', borderRadius: '100px' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>
                      🛡️ Red de Distribución: {parentDistributorName}
                    </p>
                  </div>
                )}
                {user?.role === 'SUPER_ADMIN' && (
                  <button 
                    onClick={() => {
                      setIsEditingProfile(true);
                      setEditedName(user?.full_name || '');
                      setEditedEmail(user?.email || '');
                    }}
                    className="btn glass" 
                    style={{ fontSize: '0.6rem', padding: '4px 10px', height: 'auto', borderRadius: '100px', marginBottom: '1rem' }}
                  >
                    Editar Perfil
                  </button>
                )}
              </>
            )}
          </div>
          <div style={{ display: 'inline-block', padding: '4px 16px', background: 'rgba(255,102,0,0.1)', borderRadius: '100px', border: '1px solid var(--accent-glow)', marginTop: '8px', marginBottom: '12px' }}>
            <p style={{ color: 'var(--accent)', fontWeight: 700, margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{metrics.level}</p>
          </div>
          <button 
            onClick={async () => {
              const newPassword = prompt("Cambiar Contraseña:\nIngresa tu nueva contraseña para acceder al ecosistema:");
              if (newPassword) {
                if (newPassword.length < 4) {
                  alert("La contraseña debe tener al menos 4 caracteres.");
                  return;
                }
                try {
                  await dataService.updateProfile(user.id || user.uid, { password: newPassword });
                  const updatedUser = { ...user, password: newPassword };
                  setUser(updatedUser);
                  localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
                  addNotification("Contraseña actualizada con éxito", "SUCCESS");
                  alert("Contraseña actualizada con éxito.");
                } catch (err) {
                  // Fallback local
                  const updatedUser = { ...user, password: newPassword };
                  setUser(updatedUser);
                  localStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
                  addNotification("Contraseña guardada localmente", "SUCCESS");
                  alert("Contraseña actualizada con éxito.");
                }
              }
            }}
            className="btn glass"
            style={{ fontSize: '0.65rem', padding: '4px 12px', height: 'auto', borderRadius: '100px', display: 'inline-flex', alignItems: 'center', gap: '4px', marginBottom: '1rem' }}
          >
            Cambiar Contraseña
          </button>

          {/* Badge Grid Mosaico */}
          <div style={{ marginTop: '2rem', textAlign: 'left' }}>
            <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.6, marginBottom: '0.5rem', letterSpacing: '2px', fontWeight: 700, textAlign: 'center' }}>Insignias de Logro</p>
            <BadgeGrid activeBadges={userBadges} />
          </div>

          {/* Commission Breakdown */}
          {user?.role !== 'SUPER_ADMIN' && (
            <div className="card glass" style={{ margin: '2rem 0', textAlign: 'left', padding: '1.5rem', background: 'rgba(255,102,0,0.02)' }}>
              <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.6, marginBottom: '1.5rem', letterSpacing: '2px', fontWeight: 700 }}>Estructura de Comisiones</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ fontSize: '0.55rem', opacity: 0.5, textTransform: 'uppercase', marginBottom: '8px' }}>Tasa Activa</p>
                  <h3 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.6rem' }}>{(metrics.rate * 100).toFixed(0)}%</h3>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ fontSize: '0.55rem', opacity: 0.5, textTransform: 'uppercase', marginBottom: '8px' }}>Sueldo Base</p>
                  <h3 style={{ margin: 0, color: metrics.base > 0 ? 'var(--success)' : 'inherit', fontSize: '1.6rem' }}>${metrics.base.toFixed(2)}</h3>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ fontSize: '0.55rem', opacity: 0.5, textTransform: 'uppercase', marginBottom: '8px' }}>Wallet</p>
                  <h3 style={{ margin: 0, fontSize: '1.6rem', color: 'white' }}>${(user?.wallet_balance || 0).toFixed(2)}</h3>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ fontSize: '0.55rem', opacity: 0.5, textTransform: 'uppercase', marginBottom: '8px' }}>Ventas</p>
                  <h3 style={{ margin: 0, fontSize: '1.6rem', color: 'white' }}>{sales.length}</h3>
                </div>
              </div>

              {/* Next tier hint */}
              <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,102,0,0.05)', borderRadius: '12px', border: '1px solid var(--accent-glow)' }}>
                  <p style={{ fontSize: '0.6rem', opacity: 0.7, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>Objetivo de Rango:</p>
                  {user?.role === 'SELLER' ? (
                    <>
                      {sales.length < 20 && <p style={{ fontSize: '0.75rem', color: 'var(--accent)', margin: 0, fontWeight: 600 }}>Próximo: PRO ({(20 - sales.length)} ventas restantes)</p>}
                      {sales.length >= 20 && sales.length < 31 && <p style={{ fontSize: '0.75rem', color: 'var(--accent)', margin: 0, fontWeight: 600 }}>Próximo: ULTRA ({(31 - sales.length)} ventas restantes)</p>}
                      {sales.length >= 31 && <p style={{ fontSize: '0.75rem', color: 'var(--success)', margin: 0, fontWeight: 700 }}>Nivel de Élite Alcanzado 🏆</p>}
                    </>
                  ) : (
                    <>
                      {metrics.level === 'DISTRIBUIDOR BASIC' && <p style={{ fontSize: '0.75rem', color: 'var(--accent)', margin: 0, fontWeight: 600 }}>D1: Faltan {(50 - sales.length)} ventas de equipo</p>}
                      {metrics.level === 'DISTRIBUIDOR 1' && <p style={{ fontSize: '0.75rem', color: 'var(--accent)', margin: 0, fontWeight: 600 }}>D2: Objetivo 101 ventas de equipo</p>}
                      {metrics.level === 'DISTRIBUIDOR 2' && <p style={{ fontSize: '0.75rem', color: 'var(--accent)', margin: 0, fontWeight: 600 }}>D3: Objetivo 201 ventas de equipo</p>}
                      {metrics.level === 'DISTRIBUIDOR 3' && <p style={{ fontSize: '0.75rem', color: 'var(--success)', margin: 0, fontWeight: 700 }}>Máxima Jerarquía 🏆</p>}
                    </>
                  )}
              </div>
            </div>
          )}

          {/* Super Admin Purge & System Restore Section */}
          {user?.role === 'SUPER_ADMIN' && (
            <div className="card glass" style={{ margin: '2rem 0', textAlign: 'left', padding: '1.5rem', background: 'rgba(239,68,68,0.02)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--danger)', marginBottom: '0.5rem', letterSpacing: '2px', fontWeight: 700 }}>Seguridad y Control del Sistema</p>
              <h4 style={{ margin: '0 0 10px', color: 'white', fontSize: '0.95rem' }}>Restaurar Ecosistema de Fábrica</h4>
              <p style={{ fontSize: '0.75rem', opacity: 0.6, lineHeight: '1.4', margin: '0 0 1.2rem' }}>
                Borra permanentemente todos los clientes, ventas, pedidos de inventario y personal registrado (excepto los Super Administradores maestros) para comenzar de cero.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button 
                  onClick={async () => {
                    const executePurge = async () => {
                      const confirmReset = confirm("⚠️ ¿ESTÁS ABSOLUTAMENTE SEGURO? Esta acción borrará todas las ventas, clientes y equipo registrado para iniciar de cero. No se puede deshacer.");
                      if (confirmReset) {
                        setIsLoading(true);
                        try {
                          await dataService.purgeAllData();
                          addNotification("¡Ecosistema restaurado con éxito!", "SUCCESS");
                          alert("Ecosistema purgado e iniciado de cero con éxito.");
                          window.location.reload();
                        } catch (err) {
                          alert("Error al purgar los datos: " + err.message);
                        } finally {
                          setIsLoading(false);
                        }
                      }
                    };

                    // 1. Intentar Biometría del dispositivo (TouchID/FaceID)
                    if (window.PublicKeyCredential) {
                      try {
                        // Desplegar solicitud de biometría sutil (WebAuthn)
                        const challenge = new Uint8Array([1, 2, 3, 4]);
                        const options = {
                          publicKey: {
                            challenge,
                            rp: { name: "Connexo App" },
                            user: {
                              id: new Uint8Array([1, 2, 3, 4]),
                              name: user?.email,
                              displayName: user?.full_name
                            },
                            pubKeyCredParams: [{ type: "public-key", alg: -7 }]
                          }
                        };
                        await navigator.credentials.create(options);
                        // Biometría autorizada con éxito!
                        await executePurge();
                        return;
                      } catch (e) {
                        console.warn("Biometrics failed or cancelled, falling back to password:", e);
                      }
                    }

                    // 2. Fallback de seguridad por contraseña
                    const password = prompt("🔒 Confirmación de Seguridad:\nIngresa la contraseña del Super Admin para completar la depuración:");
                    if (password === 'ConnexoApp666') {
                      await executePurge();
                    } else if (password !== null) {
                      alert("Contraseña incorrecta. Acción cancelada.");
                    }
                  }}
                  className="btn glass" 
                  style={{ width: '100%', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)', fontSize: '0.75rem', fontWeight: 700 }}
                >
                  Restaurar Datos de Fábrica
                </button>

                <button 
                  onClick={async () => {
                    const confirmSeed = confirm("¿Deseas sembrar 10 Vendedores PRO de Prueba, cada uno con 40 planes PRO/ULTRA mensuales (400 ventas en total)? Esto simulará un ecosistema activo.");
                    if (confirmSeed) {
                      setIsLoading(true);
                      try {
                        await dataService.seedTestData(user.id || user.uid);
                        addNotification("¡Ecosistema sembrado con éxito!", "SUCCESS");
                        alert("Se han creado 10 vendedores PRO con 40 ventas mensuales cada uno de forma exitosa.");
                        window.location.reload();
                      } catch (err) {
                        alert("Error al sembrar datos: " + err.message);
                      } finally {
                        setIsLoading(false);
                      }
                    }
                  }}
                  className="btn btn-primary" 
                  style={{ width: '100%', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}
                >
                  Sembrar 10 Vendedores PRO Mensual (400 Ventas)
                </button>

                <button 
                  onClick={async () => {
                    const confirmSeed = confirm("¿Deseas sembrar 10 Vendedores PRO de Prueba, cada uno con 40 planes PRO/ULTRA anuales (400 ventas en total)? Esto simulará un ecosistema activo de suscripciones anuales.");
                    if (confirmSeed) {
                      setIsLoading(true);
                      try {
                        await dataService.seedTestDataAnnual(user.id || user.uid);
                        addNotification("¡Ecosistema sembrado con éxito!", "SUCCESS");
                        alert("Se han creado 10 vendedores PRO con 40 ventas anuales cada uno de forma exitosa.");
                        window.location.reload();
                      } catch (err) {
                        alert("Error al sembrar datos: " + err.message);
                      } finally {
                        setIsLoading(false);
                      }
                    }
                  }}
                  className="btn btn-primary" 
                  style={{ width: '100%', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', background: 'linear-gradient(135deg, var(--accent-dark) 0%, var(--accent) 100%)' }}
                >
                  Sembrar 10 Vendedores PRO Anual (400 Ventas)
                </button>
              </div>
            </div>
          )}

          <button 
            onClick={() => {
              localStorage.removeItem('connexo_session');
              window.location.reload();
            }}
            className="btn glass" 
            style={{ width: '100%', marginTop: '1rem', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', fontSize: '0.8rem' }}
          >
            Finalizar Sesión de Agente
          </button>
        </motion.div>
      );

      default: return null;
    }
  };

  // --- Main Render ---
  return (
    <AnimatePresence mode="wait">
      {!isAuthenticated ? (
        <Login
          key="login"
          onLogin={handleLogin}
          onAdminBypass={handleAdminBypass}
          isLoading={isLoading}
        />
      ) : showOnboarding ? (
        <Onboarding key="onboarding" user={user} onComplete={() => setShowOnboarding(false)} />
      ) : (
        <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Header
            user={{ name: user?.full_name, ...user }}
            notificationCount={notifications.filter(n => !n.read).length}
            onShowNotifications={() => {
              alert(notifications.map(n => n.message).join('\n'));
              setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            }}
            activeTab={activeTab}
            onBack={() => setActiveTab('dashboard')}
            selectedSedeContext={selectedSedeContext}
            onChangeContext={setSelectedSedeContext}
          />
          <main role="main" style={{ flex: 1 }}>{renderContent()}</main>
          <nav role="navigation">
            <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} role={user?.role} />
          </nav>

          {/* Sedes Management Modal with Focus Trap and ARIA Attributes */}
          {showSedesModal && (
            <div 
              role="dialog" 
              aria-modal="true" 
              aria-label="Gestión de Sedes"
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.75)', padding: '1rem'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowSedesModal(false);
              }}
            >
              <div className="card glass" style={{ width: '100%', maxWidth: '450px', border: '1px solid var(--accent)', padding: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--accent)' }}>Sedes Ecosistema</h3>
                  <button 
                    onClick={() => setShowSedesModal(false)}
                    style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }}
                    aria-label="Cerrar modal"
                  >
                    ✕
                  </button>
                </div>

                {/* List of active Sedes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {sedes.map(s => {
                    const canDelete = user?.email === 'thony.karter@gmail.com';
                    return (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, color: 'white', fontSize: '0.85rem' }}>{s.nombre_sede}</p>
                          <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.6 }}>{s.pais}</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!canDelete) {
                              const msg = `Intento de eliminación fallido en Sede: ${s.nombre_sede} por usuario ${user?.email}`;
                              addNotification(`[ALERTA DE SEGURIDAD] ${msg}`, 'DANGER');
                              alert('Error: Privilegios Insuficientes. Solo el Super Admin Raíz posee el Poder de Borrado.');
                              return;
                            }
                            if (confirm(`¿Seguro que deseas eliminar la sede ${s.nombre_sede}?`)) {
                              try {
                                await dataService.deleteSede(s.id, user.email);
                                setSedes(prev => prev.filter(item => item.id !== s.id));
                                addNotification(`Sede ${s.nombre_sede} eliminada con éxito.`, 'SUCCESS');
                              } catch (err) {
                                alert(err.message);
                              }
                            }
                          }}
                          aria-label={`Eliminar sede ${s.nombre_sede}`}
                          aria-disabled={!canDelete ? "true" : undefined}
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: 'var(--danger)',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            opacity: !canDelete ? 0.5 : 1
                          }}
                        >
                          Eliminar
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Add Sede Form */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.2rem' }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', color: 'white' }}>Nueva Sede</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input 
                      type="text"
                      placeholder="Nombre de la sede (ej. Guayaquil)"
                      value={newSedeName}
                      onChange={(e) => setNewSedeName(e.target.value)}
                      aria-label="Nombre de la nueva sede"
                      style={{
                        padding: '8px 12px', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--glass-border)',
                        color: 'white', borderRadius: '8px', fontSize: '0.8rem'
                      }}
                    />
                    <select
                      value={newSedePais}
                      onChange={(e) => setNewSedePais(e.target.value)}
                      aria-label="País de la sede"
                      style={{
                        padding: '8px 12px', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--glass-border)',
                        color: 'white', borderRadius: '8px', fontSize: '0.8rem'
                      }}
                    >
                      <option value="Ecuador">Ecuador</option>
                      <option value="Venezuela">Venezuela</option>
                    </select>

                    <p style={{ margin: '8px 0 2px', fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 'bold' }}>Distribuidor Encargado (Admin de Sede)</p>
                    <select
                      value={selectedDistributorId}
                      onChange={(e) => setSelectedDistributorId(e.target.value)}
                      aria-label="Seleccionar Distribuidor Encargado"
                      style={{
                        padding: '8px 12px', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--glass-border)',
                        color: 'white', borderRadius: '8px', fontSize: '0.8rem', width: '100%'
                      }}
                    >
                      <option value="">-- Seleccionar Distribuidor --</option>
                      {team.filter(member => member.role === 'DISTRIBUTOR').map(d => (
                        <option key={d.id} value={d.id}>{d.full_name || d.name} ({d.email})</option>
                      ))}
                    </select>

                    <button
                      onClick={async () => {
                        if (!newSedeName.trim()) {
                          alert('El nombre de la sede es obligatorio.');
                          return;
                        }
                        if (!selectedDistributorId) {
                          alert('Debe seleccionar un distribuidor registrado para administrar la sede.');
                          return;
                        }
                        try {
                          const newSede = await dataService.addSede({ nombre_sede: newSedeName, pais: newSedePais });
                          
                          // 1. Asignar la sede al distribuidor seleccionado
                          await dataService.updateProfile(selectedDistributorId, { sede_asignada: newSede.id });
                          
                          // 2. Otorgar automáticamente la insignia especial 'VERIFIED_DIST' (Distribuidor Verificado)
                          const currentBadges = await dataService.getUserBadges(selectedDistributorId);
                          if (!currentBadges.includes('VERIFIED_DIST')) {
                            const updatedBadges = [...currentBadges, 'VERIFIED_DIST'];
                            await dataService.saveUserBadges(selectedDistributorId, updatedBadges);
                          }

                          // Actualizar lista de sedes localmente
                          setSedes(prev => [...prev, newSede]);
                          setNewSedeName('');
                          setSelectedDistributorId('');
                          addNotification(`Nueva Sede "${newSede.nombre_sede}" creada. El distribuidor seleccionado ha sido asignado y condecorado como Distribuidor Verificado 🛡️.`, 'SUCCESS');
                          
                          // Refrescar datos
                          refreshData();
                        } catch (err) {
                          alert(err.message);
                        }
                      }}
                      className="btn btn-primary"
                      style={{ fontSize: '0.75rem', padding: '8px', height: 'auto', marginTop: '4px' }}
                      aria-label="Crear nueva sede"
                    >
                      Crear Sede
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default App;
