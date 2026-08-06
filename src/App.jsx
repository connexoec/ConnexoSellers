import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav    from './components/layout/BottomNav';
import Header       from './components/layout/Header';
import Login        from './components/auth/Login';
import TeamManager  from './components/team/TeamManager';
import Onboarding   from './components/onboarding/Onboarding';
import SaleForm     from './components/sales/SaleForm';
import { getProfileLabel } from './constants/customerProfiles';
import Academy      from './components/academy/Academy';
import InventoryManager from './components/inventory/InventoryManager';
import { dataService, PLANS } from './services/dataService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import BadgeGrid, { BADGES_INFO } from './components/badges/BadgeGrid';
import { evaluarInsigniasAutomaticas } from './lib/badges';
import { SESSION_KEY, saveSession, loadSession, clearSession, safeSetItem, avatarKey } from './lib/storage';
import { compressImage } from './lib/image';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading,       setIsLoading]       = useState(true);   // true al inicio para restaurar sesión
  const [activeTab,       setActiveTab]       = useState(() => {
    // Al tocar una notificación del sistema, el service worker abre la app con
    // ?tab=… — esa pestaña manda sobre la última guardada.
    const TABS = ['dashboard', 'sales', 'history', 'academy', 'inventory', 'network', 'profile'];
    const pedida = new URLSearchParams(window.location.search).get('tab');
    if (pedida && TABS.includes(pedida)) {
      // Se limpia la URL para que un refresco no vuelva a forzar la pestaña.
      window.history.replaceState({}, '', window.location.pathname);
      return pedida;
    }
    return localStorage.getItem('connexo_active_tab') || 'dashboard';
  });
  const [user,            setUser]            = useState(null);
  const [team,            setTeam]            = useState([]);
  const [sales,           setSales]           = useState([]);
  const [showOnboarding,  setShowOnboarding]  = useState(false);
  const [selectedPlan,    setSelectedPlan]    = useState(null);
  const [metrics,         setMetrics]         = useState({ rate: 0, base: 0, level: 'CARGANDO...' });
  const [highContrast,    setHighContrast]    = useState(false);
  const [userBadges,      setUserBadges]      = useState([]);
  const [searchQuery,     setSearchQuery]     = useState('');
  const [planFilter,      setPlanFilter]      = useState('ALL');
  const [currentPage,     setCurrentPage]     = useState(1);
  const [expandedSaleId,  setExpandedSaleId]  = useState(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
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
  // Historial: filtro por mes ('ALL' o 'YYYY-MM') y por rol (solo SUPER ADMIN)
  const [selectedMonth,   setSelectedMonth]   = useState('ALL');
  const [roleFilter,      setRoleFilter]      = useState('ALL');
  // Toast efímero del feedback propio (ver addNotification)
  const [localToast,      setLocalToast]      = useState(null);
  const localToastTimer                       = useRef(null);
  const avisoPedidosMostrado                  = useRef(false);

  // ── Helpers de mes ────────────────────────────────────────────────────
  // El nivel se reinicia cada mes calendario, así que el progreso se mide
  // sobre las ventas del mes en curso (no sobre el histórico completo).
  const monthKey = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const monthLabel = (key) => {
    const [y, m] = key.split('-');
    const nombre = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es', { month: 'long' });
    return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`;
  };
  const currentMonthKey = monthKey(new Date());
  // Ventas del mes en curso. Para un distribuidor `sales` ya incluye las de
  // sus vendedores (getSalesForTeam), así que suman a su total.
  const salesThisMonth = sales.filter(s => s.created_at && monthKey(s.created_at) === currentMonthKey);

  // ── Nivel: cuota del mes y objetivo del siguiente rango ───────────────
  // FUENTE ÚNICA para la barra de progreso, el objetivo de rango y la
  // tarjeta de ventas: así los tres números no pueden divergir.
  //   cuota    = planes que exige el nivel actual (tabla de niveles)
  //   objetivo = planes para ascender al siguiente nivel (o la propia cuota
  //              si ya está en el máximo)
  const NIVELES = {
    'VENDEDOR PRO':   { cuota: 31,  siguiente: 'ULTRA',          objetivo: 50  },
    'VENDEDOR ULTRA': { cuota: 50,  siguiente: null,             objetivo: 50  },
    'DISTRIBUIDOR 1': { cuota: 100, siguiente: 'DISTRIBUIDOR 2', objetivo: 200 },
    'DISTRIBUIDOR 2': { cuota: 200, siguiente: 'DISTRIBUIDOR 3', objetivo: 300 },
    'DISTRIBUIDOR 3': { cuota: 300, siguiente: null,             objetivo: 300 }
  };
  // Se resuelve por el nivel REAL calculado (metrics.level), no por el tier
  // manual: un vendedor en AUTO que ya llegó a ULTRA debe ver los datos de ULTRA.
  const nivelInfo = NIVELES[metrics.level]
    || NIVELES[user?.role === 'DISTRIBUTOR' ? 'DISTRIBUIDOR 1' : 'VENDEDOR PRO'];
  const planesMes = salesThisMonth.length;
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
          // loadSession vuelve a unir la foto (guardada en su propia clave).
          const savedUser = loadSession();
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
                const localAvatar = localStorage.getItem(avatarKey(savedUser.id || savedUser.uid));
                const updatedUser = {
                  ...savedUser,
                  ...freshProfile,
                  avatar_url: freshProfile.avatar_url || localAvatar || savedUser.avatar_url
                };
                setUser(updatedUser);
                saveSession(updatedUser);
                refreshData(updatedUser);
              } else if (error && error.code === 'PGRST116') {
                console.warn("User session is invalid (deleted from Supabase). Forcing logout.");
                clearSession();
                localStorage.removeItem('connexo_active_tab');
                setUser(null);
                setIsAuthenticated(false);
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
          clearSession();
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
      
      // Resumen de pedidos pendientes para el Super Admin. Los pedidos NUEVOS
      // ya avisan solos (trigger + push); esto es el recordatorio de lo que
      // sigue sin atender. Una sola vez por sesión, para no repetirlo en cada
      // refresco de datos.
      if (role === 'SUPER_ADMIN' && !avisoPedidosMostrado.current) {
        const reqs = await dataService.getInventoryRequests(null);
        const pendientes = reqs.filter(r => r.status === 'PENDING').length;
        if (pendientes > 0) {
          avisoPedidosMostrado.current = true;
          addNotification(`Tienes ${pendientes} pedido${pendientes > 1 ? 's' : ''} de stock sin revisar en Almacén.`, 'INFO');
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
      saveSession(userData);
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
    saveSession(adminUser); // 💾 Guardar sesión admin
    setUser(adminUser);
    setIsAuthenticated(true);
    setShowOnboarding(true);
  };

  const handleLogout = async () => {
    await dataService.logout();
    clearSession(); // 🗑️ Limpiar sesión guardada
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
      let activeSedeId = user?.sede_asignada || null;
      if (user?.role === 'SUPER_ADMIN') {
        activeSedeId = selectedSedeContext === 'Venezuela' ? 'sede-ve-1' : selectedSedeContext === 'Ecuador' ? 'sede-ec-1' : null;
      } else if (!activeSedeId) {
        // Fallback robusto en caso de que el vendedor no tenga sede asignada (usuarios legacy)
        activeSedeId = 'sede-ec-1'; // Default base
      }
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
      let updatedUser = { ...user, wallet_balance: (user.wallet_balance || 0) + earned };
      setUser(updatedUser);
      saveSession(updatedUser);
      setSelectedPlan(null);
      addNotification(`Venta de ${customerData.name} registrada — +$${earned.toFixed(2)}`);
      // Recalcular métricas e historial completo de inmediato para refrescar la interfaz en tiempo real
      refreshData(updatedUser);

      // Las insignias automáticas ya NO se calculan aquí: lo hace el efecto
      // `useEffect` de más arriba, que las evalúa contra los datos reales en
      // cada carga. Antes vivían en este punto y solo se otorgaban en el
      // instante exacto de vender y en esa pestaña, así que en la práctica casi
      // nunca llegaban a concederse.
    } catch (err) {
      alert('Error al registrar venta: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSale = async (saleId) => {
    if (!window.confirm("¿Estás seguro de eliminar esta venta? Se descontará el monto de tu billetera y recalcularemos tus métricas de rango.")) return;
    setIsLoading(true);
    try {
      await dataService.deleteSale(saleId, user.uid || user.id);
      setSales(prev => prev.filter(s => s.id !== saleId));
      addNotification("Venta eliminada y balances actualizados.", "INFO");
      // Forzar recálculo instantáneo del backend local
      setTimeout(() => refreshData(user), 500);
    } catch (err) {
      alert("Error al eliminar: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSale = async (sale) => {
    const newName = prompt("Nuevo Nombre de Cliente:", sale.customer_name || '')?.trim();
    if (newName === undefined) return; // Cancelled
    
    const newPhone = prompt("Nuevo Teléfono / Contacto:", sale.customer_phone || '')?.trim();
    const newEmail = prompt("Nuevo Email del Cliente:", sale.customer_email || '')?.trim();
    
    const updates = {
       customer_name: newName || sale.customer_name,
       customer_phone: newPhone || sale.customer_phone,
       customer_email: newEmail || sale.customer_email
    };

    setIsLoading(true);
    try {
      const res = await dataService.updateSale(sale.id, updates);
      setSales(prev => prev.map(s => s.id === sale.id ? { ...s, ...res } : s));
      addNotification("Datos de cliente actualizados.", "SUCCESS");
    } catch (err) {
      alert("Error al actualizar datos: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Feedback inmediato de TU propia acción ("venta registrada", "foto
  // actualizada"…). No se guarda en la base: eso es el NotificationCenter, que
  // trae los avisos de lo que hacen los demás.
  const addNotification = (message, type = 'SUCCESS') => {
    setLocalToast({ id: Date.now(), message, type });
    if (localToastTimer.current) clearTimeout(localToastTimer.current);
    localToastTimer.current = setTimeout(() => setLocalToast(null), 4200);
  };

  // ── Avisos que NO puede detectar la base de datos ──────────────────────────
  // El nivel, la comisión y el sueldo base salen de `calcMetrics` (JavaScript),
  // así que ningún trigger de Postgres puede verlos: se detectan aquí y se
  // escriben en `notifications`, que es lo que dispara también la push.
  const ORDEN_NIVELES = [
    'VENDEDOR PRO', 'VENDEDOR ULTRA', 'DISTRIBUIDOR 1', 'DISTRIBUIDOR 2', 'DISTRIBUIDOR 3'
  ];

  useEffect(() => {
    const uid = user?.id || user?.uid;
    if (!uid || user?.role === 'SUPER_ADMIN') return;           // el admin no vende
    if (!metrics?.level || metrics.level === 'CARGANDO...') return;

    // ── Ascenso de nivel ──
    const claveNivel = `connexo_nivel_visto_${uid}`;
    const anterior = localStorage.getItem(claveNivel);
    const subio = anterior
      && anterior !== metrics.level
      && ORDEN_NIVELES.indexOf(metrics.level) > ORDEN_NIVELES.indexOf(anterior);
    if (subio) {
      dataService.notify(uid, {
        type: 'level',
        title: `🚀 ¡Ascendiste a ${metrics.level}!`,
        body: `Tu comisión sube al ${(metrics.rate * 100).toFixed(0)}% y tu sueldo base a $${metrics.base}.`,
        url: '?tab=dashboard',
        // El nivel se reinicia cada mes: la clave lleva el mes para que un
        // ascenso del mes siguiente sí vuelva a avisar.
        dedupeKey: `level:${metrics.level}:${currentMonthKey}`
      });
    }
    safeSetItem(claveNivel, metrics.level);

    // ── Sueldo base desbloqueado (una vez por mes) ──
    if (metrics.baseUnlocked && metrics.base > 0) {
      const claveBase = `connexo_base_${uid}_${currentMonthKey}`;
      if (!localStorage.getItem(claveBase)) {
        safeSetItem(claveBase, '1');
        dataService.notify(uid, {
          type: 'base',
          title: '💵 Sueldo base desbloqueado',
          body: `Cumpliste la meta de ventas anuales del mes: $${metrics.base} asegurados.`,
          url: '?tab=dashboard',
          dedupeKey: `base:${currentMonthKey}`
        });
      }
    }
  }, [metrics, user, currentMonthKey]);

  // ── Insignias automáticas ─────────────────────────────────────────────────
  // Se evalúan contra los datos REALES en cada carga, no solo al vender. Así
  // se reparan solas para quien ya cumplía el requisito de antes. Solo suman:
  // jamás quitan una insignia otorgada a mano por el Super Admin.
  useEffect(() => {
    const uid = user?.id || user?.uid;
    if (!uid || user?.role === 'SUPER_ADMIN') return;
    if (!metrics?.level || metrics.level === 'CARGANDO...') return;

    // El filtro del mes se hace AQUÍ dentro a propósito: `salesThisMonth` se
    // recalcula en cada render (es un .filter del cuerpo del componente), así
    // que ponerlo en las dependencias haría correr este efecto continuamente.
    const delMes = sales.filter(s => s.created_at && monthKey(s.created_at) === currentMonthKey);

    const ganadas = evaluarInsigniasAutomaticas({
      ventas: sales,
      ventasMes: delMes,
      usuario: user,
      metricas: metrics
    });
    const nuevas = ganadas.filter(k => !userBadges.includes(k));
    if (nuevas.length === 0) return;

    const lista = [...userBadges, ...nuevas];
    setUserBadges(lista);
    dataService.saveUserBadges(uid, lista);

    nuevas.forEach((k) => {
      const info = BADGES_INFO[k];
      const nombre = info?.title?.replace('\n', ' ') || k;
      addNotification(`🏅 ¡Insignia desbloqueada: ${nombre}!`, 'SUCCESS');
      dataService.notify(uid, {
        type: 'badge',
        title: `🏅 Insignia desbloqueada: ${nombre}`,
        body: info?.subtitle || 'Nuevo logro en tu vitrina.',
        url: '?tab=profile',
        dedupeKey: `badge:${k}`
      });
    });
  }, [sales, metrics, user, userBadges, currentMonthKey]);

  // Alta de un miembro nuevo: avisa a su distribuidor y a los super admins.
  const notificarAltaDeRed = async (newUser, nombre) => {
    const uid = user?.id || user?.uid;
    const payload = {
      type: 'team',
      title: '👥 Nuevo miembro en la red',
      body: `${nombre} se unió como ${newUser.role === 'DISTRIBUTOR' ? 'distribuidor' : 'vendedor'}.`,
      url: '?tab=network'
    };
    const padre = newUser.parent_id;
    if (padre && padre !== uid) await dataService.notify(padre, payload);
    await dataService.notifySuperAdmins(payload, uid);
  };

  // Certificación aprobada: avisa a su distribuidor y a los super admins.
  const notificarCertificacion = async (perfil) => {
    const uid = perfil?.id || perfil?.uid;
    const payload = {
      type: 'certified',
      title: '🎓 Certificación aprobada',
      body: `${perfil?.full_name || 'Un miembro del equipo'} aprobó el examen y ya cobra comisiones.`,
      url: '?tab=network'
    };
    if (perfil?.parent_id) await dataService.notify(perfil.parent_id, payload);
    await dataService.notifySuperAdmins(payload, uid);
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

  const renderHistoryContent = (standalone = true) => {
    const innerContent = (
      <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', marginTop: standalone ? 0 : '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: standalone ? '1.4rem' : '1.1rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', margin: '0 0 4px' }}>
              {standalone ? 'Movimientos' : 'Actividad de Ventas'}
            </h2>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', margin: 0 }}>Base de clientes y activaciones.</p>
          </div>
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
                  Object.keys(groupedSales).forEach((plan) => {
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
              style={{ fontSize: '0.65rem', padding: '6px 10px', height: 'auto', gap: '6px' }}
            >
              📥 PDF
            </button>
          ) : (
            <div style={{ textAlign: 'right' }}>
               <p style={{ fontSize: '0.55rem', opacity: 0.5, textTransform: 'uppercase', margin: 0 }}>FACTURADO HISTÓRICO</p>
               <p style={{ fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 700, margin: 0 }}>${sales.reduce((a, s) => a + (s.amount || 0), 0).toFixed(2)}</p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.2rem' }}>
          <input 
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            placeholder="🔍 Buscar por cliente, email..."
            style={{ width: '100%', padding: '12px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '12px', fontSize: '0.8rem' }}
          />
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', whiteSpace: 'nowrap' }}>
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

          {/* Filtro por MES — el nivel se reinicia cada mes, así que el historial
              se puede revisar mes a mes desde cualquier rol */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', whiteSpace: 'nowrap' }}>
            {['ALL', ...[...new Set(sales.map(s => s.created_at && monthKey(s.created_at)).filter(Boolean))].sort().reverse()].map((mk) => (
              <button
                key={mk}
                onClick={() => { setSelectedMonth(mk); setCurrentPage(1); }}
                style={{
                  padding: '6px 12px', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'all 0.2s',
                  background: selectedMonth === mk ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                  color: selectedMonth === mk ? 'var(--bg-primary)' : 'rgba(255,255,255,0.6)'
                }}
              >
                {mk === 'ALL' ? '🗓️ Histórico' : `${monthLabel(mk)}${mk === currentMonthKey ? ' •' : ''}`}
              </button>
            ))}
          </div>

          {/* Filtro por ROL del vendedor — solo Super Admin */}
          {user?.role === 'SUPER_ADMIN' && (
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '6px', whiteSpace: 'nowrap' }}>
              {[
                { id: 'ALL',         label: '👥 Toda la red' },
                { id: 'SELLER',      label: '🎯 Vendedores' },
                { id: 'DISTRIBUTOR', label: '🏢 Distribuidores' }
              ].map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setRoleFilter(r.id); setCurrentPage(1); }}
                  style={{
                    padding: '6px 12px', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 600,
                    border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'all 0.2s',
                    background: roleFilter === r.id ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                    color: roleFilter === r.id ? 'var(--bg-primary)' : 'rgba(255,255,255,0.6)'
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

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
              const matchesPlan = planFilter === 'ALL' ? true : (s.plan_type?.toUpperCase().includes(planFilter.toUpperCase()));
              const matchesMonth = selectedMonth === 'ALL' ? true : (s.created_at && monthKey(s.created_at) === selectedMonth);
              // Rol del vendedor que hizo la venta (el Super Admin tiene todos los perfiles en `team`)
              const matchesRole = roleFilter === 'ALL' ? true : (
                team.find(m => m.id === s.seller_id)?.role === roleFilter
              );
              return matchesSede && matchesSearch && matchesPlan && matchesMonth && matchesRole;
            });

            const ITEMS_PER_PAGE = 10;
            const totalPages = Math.ceil(filteredSales.length / ITEMS_PER_PAGE);
            const paginatedSales = filteredSales.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

            // Resumen de lo que se está viendo (mes/rol/plan seleccionados)
            const resumen = {
              total:      filteredSales.length,
              anuales:    filteredSales.filter(s => s.plan_type?.toUpperCase().includes('ANUAL')).length,
              facturado:  filteredSales.reduce((a, s) => a + (s.amount || 0), 0),
              comisiones: filteredSales.reduce((a, s) => a + (s.commission_earned || 0), 0)
            };

            const resumenCard = (
              <div className="card glass" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '4px', borderLeft: '3px solid var(--accent)' }}>
                {[
                  { l: 'PLANES',     v: resumen.total },
                  { l: 'ANUALES',    v: resumen.anuales },
                  { l: 'FACTURADO',  v: `$${resumen.facturado.toFixed(0)}` },
                  { l: 'COMISIONES', v: `$${resumen.comisiones.toFixed(0)}` }
                ].map(item => (
                  <div key={item.l} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '0.45rem', opacity: 0.5, letterSpacing: '1px', margin: 0 }}>{item.l}</p>
                    <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)', margin: '2px 0 0' }}>{item.v}</p>
                  </div>
                ))}
              </div>
            );

            if (filteredSales.length === 0) {
              return (
                <>
                  {resumenCard}
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', opacity: 0.5 }}>
                    <p style={{ fontSize: '0.8rem', margin: 0 }}>No hay registros encontrados.</p>
                  </div>
                </>
              );
            }

            return (
              <>
                {resumenCard}
                {paginatedSales.map(s => {
                  const sellerMember = user?.role !== 'SELLER' && team.find(m => m.id === s.seller_id);
                  const isExpanded = expandedSaleId === s.id;
                  
                  if (user?.role === 'SUPER_ADMIN' || user?.role === 'DISTRIBUTOR') {
                    return (
                      <div 
                        key={s.id} 
                        className="card glass" 
                        onClick={() => setExpandedSaleId(isExpanded ? null : s.id)}
                        style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: `3px solid ${s.plan_type?.includes('ULTRA') ? 'var(--accent)' : 'var(--success)'}`, cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: 'white' }}>{s.customer_name || 'Cliente'}</p>
                            <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600 }}>
                              {s.plan_type} · ${s.amount}
                              {getProfileLabel(s.profile_type) && (
                                <span style={{ marginLeft: '6px', fontSize: '0.6rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                  {getProfileLabel(s.profile_type)}
                                </span>
                              )}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: 0, fontSize: '0.65rem', opacity: 0.5 }}>{new Date(s.created_at).toLocaleDateString()}</p>
                            <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Por: {sellerMember?.full_name || 'Propio'}</p>
                          </div>
                        </div>
                        {isExpanded && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                            style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}
                            onClick={e => e.stopPropagation()}
                          >
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                              <p style={{ margin: 0 }}>📞 {s.customer_phone || 'N/A'}</p>
                              <p style={{ margin: 0 }}>📧 {s.customer_email || 'N/A'}</p>
                            </div>
                            {(user?.role === 'SUPER_ADMIN' || (user?.uid || user?.id) === s.seller_id) && (
                               <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', marginTop: '10px' }}>
                                 <button onClick={() => handleEditSale(s)} className="btn glass" style={{ flex: 1, fontSize: '0.65rem', padding: '6px', height: 'auto' }}>✏️ Editar</button>
                                 <button onClick={() => handleDeleteSale(s.id)} className="btn" style={{ flex: 1, fontSize: '0.65rem', padding: '6px', height: 'auto', color: '#ff6b6b', background: 'rgba(220,53,69,0.1)' }}>🗑️ Eliminar</button>
                               </div>
                            )}
                          </motion.div>
                        )}
                      </div>
                    );
                  }

                  const canManage = (user.uid || user.id) === s.seller_id;
                  return (
                    <div 
                      key={s.id} 
                      className="card glass" 
                      onClick={() => setExpandedSaleId(isExpanded ? null : s.id)}
                      style={{ display: 'flex', flexDirection: 'column', gap: '8px', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'white' }}>
                            {s.customer_name || 'Cliente'}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.65rem', opacity: 0.5 }}>
                            {s.plan_type}{getProfileLabel(s.profile_type) ? ` · ${getProfileLabel(s.profile_type)}` : ''} · {new Date(s.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ margin: 0, color: 'var(--success)', fontWeight: 700, fontSize: '0.9rem' }}>+${(s.commission_earned || 0).toFixed(2)}</p>
                          <p style={{ margin: 0, fontSize: '0.6rem', opacity: 0.5 }}>${(s.amount || 0).toFixed(2)}</p>
                        </div>
                      </div>
                      {isExpanded && (
                         <motion.div 
                           initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                           style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}
                           onClick={e => e.stopPropagation()}
                         >
                           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: canManage ? '10px' : 0 }}>
                             <p style={{ margin: 0 }}>📞 {s.customer_phone || 'N/A'}</p>
                             <p style={{ margin: 0 }}>📧 {s.customer_email || 'N/A'}</p>
                           </div>
                           {canManage && (
                             <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                               <button onClick={() => handleEditSale(s)} className="btn glass" style={{ flex: 1, fontSize: '0.65rem', height: 'auto', padding: '6px' }}>✏️ Editar</button>
                               <button onClick={() => handleDeleteSale(s.id)} className="btn" style={{ flex: 1, fontSize: '0.65rem', height: 'auto', padding: '6px', backgroundColor: 'rgba(220,53,69,0.15)', color: '#ff6b6b' }}>🗑️ Eliminar</button>
                             </div>
                           )}
                         </motion.div>
                      )}
                    </div>
                  );
                })}

                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.2rem' }}>
                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} className="btn glass" style={{ fontSize: '0.65rem', padding: '6px 12px', height: 'auto', opacity: currentPage === 1 ? 0.3 : 1 }}>◀ Ant.</button>
                    <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>{currentPage}/{totalPages}</span>
                    <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} className="btn glass" style={{ fontSize: '0.65rem', padding: '6px 12px', height: 'auto', opacity: currentPage === totalPages ? 0.3 : 1 }}>Sig. ▶</button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </>
    );

    if (standalone) {
      return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="slide-up" style={{ padding: '0 1.5rem 100px', fontFamily: 'var(--font-main)' }}>
          {innerContent}
        </motion.div>
      );
    }
    return (
      <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.5rem' }}>
        {innerContent}
      </div>
    );
  };

  // --- Tab Content ---
  const renderContent = () => {
    switch (activeTab) {

      case 'dashboard': return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="slide-up" style={{ padding: '0 1.5rem 100px', fontFamily: 'var(--font-main)' }}>

          {/* Status Card */}
          {user?.role === 'SUPER_ADMIN' ? (
            <>
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
                  <p style={{ fontSize: '0.65rem', opacity: 0.8, margin: 0, textTransform: 'uppercase' }}>Ventas del mes ({selectedSedeContext})</p>
                  <p style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent)', margin: '4px 0 0' }}>
                    {getFilteredSales().filter(s => s.created_at && monthKey(s.created_at) === currentMonthKey).length}
                  </p>
                  <p style={{ fontSize: '0.55rem', opacity: 0.5, margin: '2px 0 0' }}>
                    Histórico: {getFilteredSales().length}
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

            {/* TABLA DE PRECIOS / INVERSIONES TIPO BILLETERA */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2.5rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.2rem', marginTop: '0.5rem' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '1.1rem' }}>💼</span>
                <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', margin: 0, letterSpacing: '1px' }}>Precios e Inversión Connexo</h3>
              </div>

              <div className="card glass" style={{ padding: '1.25rem' }}>
                <h4 style={{ fontSize: '0.75rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', color: 'var(--accent)' }}>Planes de Inversión por Niveles</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { lvl: 'Nivel 1', units: '100 unidades', inv: '$526.00', margin: '$53.20' },
                    { lvl: 'Nivel 2', units: '200 unidades', inv: '$1,052.00', margin: '$106.40' },
                    { lvl: 'Nivel 3', units: '300 unidades', inv: '$1,578.00', margin: '$159.60' }
                  ].map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.85rem', color: 'white' }}>{item.lvl}</p>
                        <p style={{ margin: 0, fontSize: '0.65rem', opacity: 0.6 }}>{item.units}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--accent)' }}>{item.inv} Inv.</p>
                        <p style={{ margin: 0, fontSize: '0.65rem', color: 'var(--success)', fontWeight: '600' }}>{item.margin} Margen</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card glass" style={{ padding: '1.25rem', overflowX: 'auto' }}>
                <h4 style={{ fontSize: '0.75rem', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', color: 'var(--accent)' }}>Detalle Costos Unitarios NFC</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent)' }}>
                      <th style={{ padding: '8px 4px' }}>Ítem</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center' }}>Costo</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center' }}>Precio Dist.</th>
                      <th style={{ padding: '8px 4px', textAlign: 'right' }}>Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Tarjeta NFC Negra', cost: '$0.27', dist: '$0.45', marg: '$0.18' },
                      { name: 'Tarjeta NFC Blanca', cost: '$0.25', dist: '$0.45', marg: '$0.20' },
                      { name: 'Pulsera NFC', cost: '$3.60', dist: '$5.50', marg: '$1.90' },
                      { name: 'Lector NFC', cost: '$60.00', dist: '$80.00', marg: '$20.00' },
                      { name: 'Chips (100u)', cost: '$27.90', dist: '$40.00', marg: '$12.10' },
                      { name: 'Empaque', cost: '$3.00', dist: '$3.00*', marg: '$0.00' },
                      { name: 'Impresión', cost: '$4.00', dist: '$4.00*', marg: '$0.00' }
                    ].map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '8px 4px', fontWeight: 500, color: 'white' }}>{row.name}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'center', opacity: 0.7 }}>{row.cost}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'center', color: 'var(--accent)', fontWeight: 'bold' }}>{row.dist}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--success)' }}>{row.marg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
            </>
          ) : (
            <div className="card glass" style={{ marginBottom: '2rem', border: '1px solid var(--accent-glow)', background: 'linear-gradient(135deg, var(--bg-secondary) 0%, #2b1208 100%)' }}>
              <p style={{ fontSize: '0.6rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Estatus de Agente</p>
              <h2 style={{ color: 'var(--accent)', margin: '0', fontSize: '1.4rem', textShadow: '0 0 10px var(--accent-glow)' }}>{metrics.level}</h2>
              
              {/* Progreso de Nivel (Dinámico) — mide contra el objetivo del
                  siguiente rango; si ya es el máximo, contra su propia cuota */}
              {(() => {
                const target = nivelInfo.objetivo;
                const percent = Math.min((planesMes / target) * 100, 100).toFixed(0);

                return (
                  <div style={{ margin: '20px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <p style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                        {nivelInfo.siguiente ? `Progreso a ${nivelInfo.siguiente} (este mes)` : 'Cuota del nivel (este mes)'}
                      </p>
                      <p style={{ fontSize: '0.65rem', color: 'var(--accent)', fontWeight: 600 }}>{planesMes} / {target} ({percent}%)</p>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                      <motion.div
                        className="progress-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        style={{ height: '100%' }}
                      />
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: user?.is_certified ? 'var(--success)' : 'var(--danger)', boxShadow: `0 0 10px ${user?.is_certified ? 'var(--success)' : 'var(--danger)'}` }} />
                 <p style={{ fontSize: '0.7rem', fontWeight: 700, color: user?.is_certified ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-heading)', margin: 0 }}>
                   {user?.is_certified ? 'CERTIFICADO CONNEXO' : 'CERTIFICACIÓN PENDIENTE'}
                 </p>
              </div>

              {/* Next tier hint / Objetivo de Rango */}
              <div style={{ marginTop: '1.2rem', paddingTop: '1.2rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <p style={{ fontSize: '0.6rem', opacity: 0.7, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>Objetivo de Rango (este mes):</p>
                  {(() => {
                    const faltan = Math.max(0, nivelInfo.objetivo - planesMes);
                    const unidad = user?.role === 'DISTRIBUTOR' ? 'ventas de equipo' : 'ventas';

                    // Todavía hay un rango por encima
                    if (nivelInfo.siguiente) {
                      return faltan > 0
                        ? <p style={{ fontSize: '0.75rem', color: 'var(--accent)', margin: 0, fontWeight: 600 }}>Próximo: {nivelInfo.siguiente} — {nivelInfo.objetivo} {unidad} (Faltan {faltan})</p>
                        : <p style={{ fontSize: '0.75rem', color: 'var(--success)', margin: 0, fontWeight: 700 }}>Objetivo cumplido: subes a {nivelInfo.siguiente}</p>;
                    }

                    // Rango máximo: se mide contra su propia cuota
                    return faltan > 0
                      ? <p style={{ fontSize: '0.75rem', color: 'var(--accent)', margin: 0, fontWeight: 600 }}>Cuota máxima: {nivelInfo.objetivo} {unidad} (Faltan {faltan})</p>
                      : <p style={{ fontSize: '0.75rem', color: 'var(--success)', margin: 0, fontWeight: 700 }}>Máxima Jerarquía y Cuota Completada</p>;
                  })()}
              </div>
            </div>
          )}

          {/* Stats Grid — único, contextualizado por rol */}
          {user?.role !== 'SUPER_ADMIN' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '2.5rem' }}>
              <div className="card glass" style={{ borderLeft: '3px solid var(--accent)', position: 'relative' }}>
                <p style={{ fontSize: '0.55rem', opacity: 0.5, letterSpacing: '1px' }}>BILLETERA</p>
                <h3 style={{ margin: '4px 0', fontSize: '1.25rem', color: 'white' }}>${(user?.wallet_balance || 0).toFixed(2)}</h3>
                <p style={{ position: 'absolute', bottom: '6px', left: '12px', fontSize: '0.5rem', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>
                  Comisiones acumuladas
                </p>
              </div>
              <div 
                className="card glass" 
                style={{ 
                  borderLeft: `3px solid ${metrics.baseUnlocked ? 'var(--success)' : 'rgba(255,255,255,0.2)'}`,
                  opacity: metrics.baseUnlocked ? 1 : 0.45,
                  position: 'relative',
                  transition: 'all 0.3s ease'
                }}
              >
                <p style={{ fontSize: '0.55rem', opacity: 0.5, letterSpacing: '1px' }}>
                  SUELDO BASE {metrics.baseUnlocked ? '✅' : '🔒'}
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                   <h3 style={{ margin: '4px 0', fontSize: '1.25rem', color: metrics.baseUnlocked && metrics.base > 0 ? 'var(--success)' : 'white' }}>
                     ${metrics.base.toFixed(0)}
                   </h3>
                   {metrics.baseUnlocked && (
                     <span style={{ fontSize: '0.55rem', color: 'var(--success)', fontWeight: 'bold', textTransform: 'uppercase' }}>ACTIVO</span>
                   )}
                </div>
                <p style={{ position: 'absolute', bottom: '6px', left: '12px', fontSize: '0.5rem', color: metrics.baseUnlocked ? 'var(--success)' : 'var(--accent)', margin: 0, fontWeight: 600 }}>
                  Req: {Math.min(metrics.annualSalesCount || 0, metrics.annualSalesGoal || 8)}/{metrics.annualSalesGoal || 8} Anuales
                </p>
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
              {/* Ventas del MES (es lo que define nivel, comisión y sueldo base).
                  El histórico completo queda como dato secundario. */}
              <div className="card glass" style={{ borderLeft: '3px solid white', position: 'relative' }}>
                <p style={{ fontSize: '0.55rem', opacity: 0.5, letterSpacing: '1px' }}>
                  {user?.role === 'SELLER' ? 'MIS VENTAS (MES)' : 'VENTAS RED (MES)'}
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <h3 style={{ margin: '4px 0', fontSize: '1.25rem', color: 'white' }}>{planesMes}</h3>
                  <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>/ {nivelInfo.cuota}</span>
                </div>
                <p style={{ position: 'absolute', bottom: '6px', left: '12px', fontSize: '0.5rem', color: 'var(--text-secondary)', margin: 0, fontWeight: 600 }}>
                  Histórico: {sales.length}
                </p>
              </div>
            </div>
          )}

           {user?.role === 'DISTRIBUTOR' && renderHistoryContent(false)}
           {/* Fin Dashboard Section */}
        </motion.div>
      );

      case 'history': return renderHistoryContent(true);


      case 'sales': return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="slide-up" style={{ padding: '0 1.5rem 100px', fontFamily: 'var(--font-main)' }}>
          <div style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>Terminal de Ventas</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Seleccione el plan de suscripción para el cliente.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Plan Connecta Card */}
            <div 
              className="card glass" 
              onClick={() => !isLoading && setSelectedPlan('CONNECTA')}
              style={{ cursor: 'pointer', borderLeft: '4px solid var(--success)', padding: '1.5rem', background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(43,18,8,0) 100%)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="tier-badge" style={{ marginBottom: '8px', display: 'inline-block', background: 'rgba(16,185,129,0.2)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.4)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 'bold' }}>PLAN CONNECTA</span>
                  <h3 style={{ margin: '4px 0 12px', fontSize: '1.5rem' }}>Connexo Connecta</h3>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>Versión de prueba por 7 días gratis para experimentar la aplicación.</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.6rem', opacity: 0.5, textTransform: 'uppercase' }}>Precio</p>
                  <h3 style={{ margin: 0, color: 'var(--success)', fontSize: '1.4rem' }}>Gratis</h3>
                  <p style={{ fontSize: '0.55rem', opacity: 0.6, margin: 0 }}>7 días de prueba</p>
                </div>
              </div>
            </div>

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
                  <h3 style={{ margin: 0, color: 'var(--tier-ultra)', fontSize: '1.4rem' }}>$197</h3>
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
            const nombre = newUser.full_name || newUser.name;
            addNotification(`${nombre} agregado al equipo`, 'SUCCESS');
            // Aviso persistente. Va desde el cliente y no por trigger a
            // propósito: `seedCompleteScenario` inserta perfiles directo en la
            // tabla, así que un trigger dispararía 21 avisos en cada siembra.
            notificarAltaDeRed(newUser, nombre);
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
              saveSession(updatedUser);
              addNotification('¡Certificación completada! Comisiones desbloqueadas.', 'SUCCESS');
              notificarCertificacion(updatedUser);
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
          metrics={metrics}
          addNotification={addNotification} 
          selectedSedeContext={selectedSedeContext}
        />
      );

      case 'profile': return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="slide-up" style={{ padding: '2rem 1.5rem 100px', fontFamily: 'var(--font-main)', textAlign: 'center', position: 'relative' }}>
          {/* Botón de Configuración (Tuerca Dorada) */}
          <div style={{ position: 'absolute', top: '2rem', right: '1.5rem', zIndex: 10 }}>
            <button 
              onClick={() => setShowProfileSettings(!showProfileSettings)}
              className="btn-circle glass"
              title="Ajustes de Perfil"
              style={{ 
                width: '38px', height: '38px', borderRadius: '50%', border: '1px solid var(--accent-glow)', 
                background: showProfileSettings ? 'rgba(255,102,0,0.2)' : 'rgba(0,0,0,0.3)', 
                color: 'var(--accent)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                cursor: 'pointer', transition: 'all 0.3s ease', boxShadow: '0 0 10px rgba(255,102,0,0.1)'
              }}
            >
              ⚙️
            </button>
          </div>
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
              <span style={{ fontWeight: 'bold' }}>+</span>
            </div>
            <input 
              id="avatar-upload-input"
              type="file" 
              accept="image/*" 
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = ''; // permite volver a elegir la misma foto
                if (!file) return;
                try {
                  // La foto del celular pesa varios MB: se redimensiona y
                  // recomprime antes de guardarla (queda en ~30-60 KB).
                  const base64data = await compressImage(file);
                  const uid = user.id || user.uid;
                  // Se muestra al instante, sin esperar a la nube.
                  const updatedUser = { ...user, avatar_url: base64data };
                  setUser(updatedUser);
                  saveSession(updatedUser);
                  try {
                    await dataService.updateProfile(uid, { avatar_url: base64data });
                    addNotification("Foto de perfil actualizada", "SUCCESS");
                  } catch {
                    addNotification("Foto de perfil guardada localmente", "SUCCESS");
                  }
                } catch (err) {
                  alert("No se pudo procesar la imagen: " + err.message);
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
                        saveSession(updatedUser);
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
                {user?.role !== 'DISTRIBUTOR' && (
                  <p style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '4px', marginBottom: '8px' }}>{user?.email}</p>
                )}
                {(() => {
                  if (user?.role !== 'DISTRIBUTOR') return null;
                  const validSede = user?.sede_asignada && user.sede_asignada !== 'null' && user.sede_asignada !== 'GLOBAL' && (
                    sedes.find(s => s.id === user.sede_asignada) || 
                    user.sede_asignada === 'sede-ve-1' || 
                    user.sede_asignada === 'sede-ec-1'
                  );
                  if (validSede) {
                    const sedeName = sedes.find(s => s.id === user.sede_asignada)?.pais || (user.sede_asignada === 'sede-ve-1' ? 'VENEZUELA' : 'ECUADOR');
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '4px auto 12px', padding: '6px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '100px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }} />
                        <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.8)', fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '2px' }}>
                          SEDE OFICIAL: <span style={{ color: 'white', fontWeight: 700 }}>{sedeName}</span>
                        </p>
                      </div>
                    );
                  }
                  return (
                    <p style={{ fontSize: '0.7rem', opacity: 0.4, marginTop: '4px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>DISTRIBUIDOR</p>
                  );
                })()}
                {user?.role === 'SELLER' && parentDistributorName && (
                  <div style={{ display: 'inline-block', margin: '4px auto 12px', padding: '4px 12px', background: 'rgba(255,102,0,0.1)', border: '1px solid var(--accent)', borderRadius: '100px' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Red de Distribución: {parentDistributorName}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="pulse-glow" style={{ display: 'inline-block', padding: '4px 16px', background: 'rgba(255,122,26,0.12)', borderRadius: '100px', border: '1px solid var(--accent-glow)', marginTop: '8px', marginBottom: '12px' }}>
            <p style={{ color: 'var(--accent-light)', fontWeight: 700, margin: 0, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{metrics.level}</p>
          </div>

          {/* Panel de Configuración Oculto (Tuerca Dorada) */}
          {showProfileSettings && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }} 
              animate={{ height: 'auto', opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="card glass" 
              style={{ 
                margin: '1rem auto 1.5rem', padding: '1.2rem', maxWidth: '340px', textAlign: 'left', 
                border: '1px solid var(--accent-glow)', background: 'linear-gradient(135deg, rgba(255,102,0,0.03) 0%, rgba(0,0,0,0.2) 100%)',
                borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden'
              }}
            >
              <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.6, margin: '0 0 1rem', letterSpacing: '2px', fontWeight: 700, color: 'var(--accent)', textAlign: 'center' }}>Ajustes de Perfil</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button 
                  onClick={() => {
                    setIsEditingProfile(true);
                    setEditedName(user?.full_name || '');
                    setEditedEmail(user?.email || '');
                    setShowProfileSettings(false);
                  }}
                  className="btn glass" 
                  style={{ fontSize: '0.7rem', padding: '10px', height: 'auto', width: '100%', justifyContent: 'flex-start', gap: '8px' }}
                >
                  📝 Editar Perfil
                </button>
                
                <button 
                  onClick={async () => {
                    setShowProfileSettings(false);
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
                        saveSession(updatedUser);
                        addNotification("Contraseña actualizada con éxito", "SUCCESS");
                        alert("Contraseña actualizada con éxito.");
                      } catch (err) {
                        // Fallback local
                        const updatedUser = { ...user, password: newPassword };
                        setUser(updatedUser);
                        saveSession(updatedUser);
                        addNotification("Contraseña guardada localmente", "SUCCESS");
                        alert("Contraseña actualizada con éxito.");
                      }
                    }
                  }}
                  className="btn glass"
                  style={{ fontSize: '0.7rem', padding: '10px', height: 'auto', width: '100%', justifyContent: 'flex-start', gap: '8px' }}
                >
                  🔑 Cambiar Contraseña
                </button>

                <button 
                  onClick={() => {
                    setShowProfileSettings(false);
                    if (confirm('¿Limpiar la caché local del navegador? Esto eliminará usuarios fantasma atrapados en la memoria de tu computadora, pero no afectará la base de datos real en la nube.')) {
                      localStorage.removeItem('connexo_team');
                      localStorage.removeItem('connexo_sales');
                      window.location.reload();
                    }
                  }}
                  className="btn glass" 
                  style={{ fontSize: '0.7rem', padding: '10px', height: 'auto', width: '100%', justifyContent: 'flex-start', gap: '8px', background: 'rgba(239,68,68,0.05)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  🗑️ Limpiar Caché Local
                </button>

                {user?.role === 'SUPER_ADMIN' && (
                  <button 
                    onClick={async () => {
                      setShowProfileSettings(false);
                      const executePurge = async () => {
                        const confirmReset = confirm("¿ESTÁS ABSOLUTAMENTE SEGURO? Esta acción borrará todas las ventas, clientes y equipo registrado para iniciar de cero. No se puede deshacer.");
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

                      if (window.PublicKeyCredential) {
                        try {
                          const challenge = new Uint8Array([1, 2, 3, 4]);
                          const options = {
                            publicKey: {
                              challenge,
                              rp: { name: "Connexo App" },
                              user: { id: new Uint8Array([1, 2, 3, 4]), name: user?.email, displayName: user?.full_name },
                              pubKeyCredParams: [{ type: "public-key", alg: -7 }]
                            }
                          };
                          await navigator.credentials.create(options);
                          await executePurge();
                          return;
                        } catch (e) {
                          console.warn("Biometrics failed or cancelled, falling back to password:", e);
                        }
                      }

                      const password = prompt("🔒 Confirmación de Seguridad:\nIngresa la contraseña del Super Admin para completar la depuración:");
                      if (password === 'ConnexoApp666') {
                        await executePurge();
                      } else if (password !== null) {
                        alert("Contraseña incorrecta. Acción cancelada.");
                      }
                    }}
                    className="btn glass" 
                    style={{ fontSize: '0.7rem', padding: '10px', height: 'auto', width: '100%', justifyContent: 'flex-start', gap: '8px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.3)' }}
                  >
                    ⚠️ Restaurar Datos de Fábrica
                  </button>
                )}

                <button 
                  onClick={() => {
                    localStorage.removeItem('connexo_session');
                    window.location.reload();
                  }}
                  className="btn glass" 
                  style={{ fontSize: '0.7rem', padding: '10px', height: 'auto', width: '100%', justifyContent: 'flex-start', gap: '8px', color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)' }}
                >
                  🚪 Finalizar Sesión de Agente
                </button>
              </div>
            </motion.div>
          )}

          {/* Badge Grid Mosaico */}
          <div style={{ marginTop: '2rem', textAlign: 'left' }}>
            <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.6, marginBottom: '0.5rem', letterSpacing: '2px', fontWeight: 700, textAlign: 'center' }}>Insignias de Logro</p>
            <BadgeGrid activeBadges={userBadges} />
          </div>



          {/* Super Admin Purge & System Restore Section */}
          {user?.role === 'SUPER_ADMIN' && (
            <div className="card glass" style={{ margin: '2rem 0', textAlign: 'left', padding: '1.5rem', background: 'rgba(239,68,68,0.02)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--danger)', marginBottom: '0.5rem', letterSpacing: '2px', fontWeight: 700 }}>Seguridad y Control del Sistema</p>
              <h4 style={{ margin: '0 0 10px', color: 'white', fontSize: '0.95rem' }}>Generar Escenario de Prueba</h4>
              <p style={{ fontSize: '0.75rem', opacity: 0.6, lineHeight: '1.4', margin: '0 0 1.2rem' }}>
                Esto creará un escenario completo de prueba (Vendedores PRO, ULTRA y Distribuidores 1, 2 y 3).
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button 
                  onClick={async () => {
                    const confirmSeed = confirm("¿Deseas crear el ESCENARIO COMPLETO de prueba?\n\nCada rol cumple su meta de anuales (sueldo base ACTIVADO) y suma planes mensuales extra:\n\n• Vendedor 1 (PRO) — 8 anuales + 6 mensuales = 14 planes\n• Vendedor 2 (ULTRA) — 13 anuales + 40 mensuales = 53 planes\n• Distribuidor 1 — 3 vendedores, 102 planes de equipo (27 anuales)\n• Distribuidor 2 — 5 vendedores, 210 planes de equipo (55 anuales)\n• Distribuidor 3 — 10 vendedores, 310 planes de equipo (100 anuales)\n\nAdemás se siembran los 2 MESES ANTERIORES al ~50% para poder revisar el historial mes a mes.\n\nOJO: purga todos los datos actuales y puede tardar un minuto.");
                    if (confirmSeed) {
                      setIsLoading(true);
                      try {
                        const result = await dataService.seedCompleteScenario(user.id || user.uid);
                        addNotification("¡Escenario completo sembrado con éxito!", "SUCCESS");
                        alert(`✅ ESCENARIO COMPLETO CREADO:\n\n• ${result.vendedor1.full_name} → 14 planes del mes (8 anuales)\n• ${result.vendedor2.full_name} → 53 planes del mes (13 anuales)\n• ${result.distribuidor1.full_name} → 3 vendedores, 102 planes de equipo (27 anuales)\n• ${result.distribuidor2.full_name} → 5 vendedores, 210 planes de equipo (55 anuales)\n• ${result.distribuidor3.full_name} → 10 vendedores, 310 planes de equipo (100 anuales)\n\nTodos con sueldo base ACTIVADO + historial de los 2 meses anteriores.\n\nContraseña universal: connexo123`);
                        window.location.reload();
                      } catch (err) {
                        alert("Error al sembrar escenario: " + err.message);
                      } finally {
                        setIsLoading(false);
                      }
                    }
                  }}
                  className="btn btn-primary" 
                  style={{ width: '100%', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', border: '1px solid rgba(16,185,129,0.4)' }}
                >
                  🧪 Sembrar Escenario Completo (V1+V2+D1+D2+D3)
                </button>
              </div>
            </div>
          )}
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
            onNavigate={(tab) => setActiveTab(tab)}
            activeTab={activeTab}
            onBack={() => setActiveTab('dashboard')}
            selectedSedeContext={selectedSedeContext}
            onChangeContext={setSelectedSedeContext}
          />
          <main role="main" style={{ flex: 1 }}>{renderContent()}</main>
          <nav role="navigation">
            <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} role={user?.role} />
          </nav>

          {/* Toast del feedback propio. Va ABAJO, sobre la barra de navegación,
              para no chocar con el toast de notificaciones (que sale arriba). */}
          <AnimatePresence>
            {localToast && (
              <motion.div
                key={localToast.id}
                initial={{ opacity: 0, y: 26, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 340, damping: 26 }}
                role="status"
                className="glass"
                style={{
                  position: 'fixed', bottom: 'calc(var(--nav-height) + 14px)', left: '50%',
                  transform: 'translateX(-50%)', width: 'min(420px, 90vw)', zIndex: 4000,
                  borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                  border: `1px solid ${localToast.type === 'ERROR' ? 'var(--danger)' : 'var(--success)'}55`,
                  boxShadow: `0 10px 30px rgba(0,0,0,0.55), 0 0 22px -10px ${localToast.type === 'ERROR' ? 'var(--danger)' : 'var(--success)'}`
                }}
              >
                <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>
                  {localToast.type === 'ERROR' ? '⚠️' : '✅'}
                </span>
                <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {localToast.message}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sedes Management Modal with Focus Trap and ARIA Attributes */}
          {showSedesModal && createPortal(
            <div 
              role="dialog" 
              aria-modal="true" 
              aria-label="Gestión de Sedes"
              style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
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
            </div>,
            document.body
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default App;
