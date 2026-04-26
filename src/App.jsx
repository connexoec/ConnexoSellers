import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav    from './components/layout/BottomNav';
import Header       from './components/layout/Header';
import Login        from './components/auth/Login';
import TeamManager  from './components/team/TeamManager';
import Onboarding   from './components/onboarding/Onboarding';
import SaleForm     from './components/sales/SaleForm';
import Academy      from './components/academy/Academy';
import { dataService, PLANS } from './services/dataService';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading,       setIsLoading]       = useState(false);
  const [activeTab,       setActiveTab]       = useState('dashboard');
  const [user,            setUser]            = useState(null);
  const [team,            setTeam]            = useState([]);
  const [sales,           setSales]           = useState([]);
  const [showOnboarding,  setShowOnboarding]  = useState(false);
  const [selectedPlan,    setSelectedPlan]    = useState(null);
  const [metrics,         setMetrics]         = useState({ rate: 0, base: 0, level: 'CARGANDO...' });
  const [notifications,   setNotifications]   = useState([
    { id: 1, message: 'Ecosistema Connexo v2.2 iniciado', type: 'INFO', read: false }
  ]);

  // Refrescar métricas y equipo cuando cambia el usuario
  useEffect(() => {
    if (isAuthenticated && user) refreshData();
  }, [isAuthenticated, user?.uid]);

  const refreshData = async () => {
    try {
      const [newMetrics, teamData, salesData] = await Promise.all([
        dataService.getMetrics(user),
        user.role !== 'SELLER' ? dataService.getTeam(user.uid || user.id) : Promise.resolve([]),
        dataService.getSales(user.uid || user.id)
      ]);
      setMetrics(newMetrics);
      setTeam(teamData);
      setSales(salesData);
    } catch (err) {
      console.error('Error al refrescar datos:', err);
    }
  };

  // --- Handlers ---
  const handleLogin = async (email, password) => {
    setIsLoading(true);
    try {
      const userData = await dataService.login(email, password);
      setUser(userData);
      setIsAuthenticated(true);
      setShowOnboarding(true);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminBypass = (adminUser) => {
    setUser(adminUser);
    setIsAuthenticated(true);
    setShowOnboarding(true);
  };

  const handleLogout = async () => {
    await dataService.logout();
    setIsAuthenticated(false);
    setUser(null);
    setSales([]);
    setTeam([]);
    setMetrics({ rate: 0, base: 0, level: 'CARGANDO...' });
    setActiveTab('dashboard');
    setShowOnboarding(false);
  };

  const handleRegisterSale = async (planKey, customerData) => {
    setIsLoading(true);
    try {
      const newSale = await dataService.registerSale(
        user.uid || user.id,
        planKey,
        customerData,
        metrics.rate,
        user.is_certified
      );
      setSales(prev => [newSale, ...prev]);
      setSelectedPlan(null);
      addNotification(`Venta de ${customerData.name} registrada — +$${newSale.commission_earned.toFixed(2)}`);
      refreshData();
    } catch (err) {
      alert('Error al registrar venta: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const addNotification = (message, type = 'SUCCESS') => {
    setNotifications(prev => [{ id: Date.now(), message, type, read: false }, ...prev]);
  };

  // --- Loading Screen ---
  if (isLoading && !isAuthenticated) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--accent)', fontFamily: 'Verdana', padding: '2rem', textAlign: 'center', gap: '1.5rem' }}>
        <div style={{ width: 40, height: 40, border: '4px solid rgba(255,102,0,0.2)', borderTop: '4px solid var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p>Iniciando Ecosistema...</p>
      </div>
    );
  }

  // --- Tab Content ---
  const renderContent = () => {
    switch (activeTab) {

      case 'dashboard': return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '0 1.5rem 100px', fontFamily: 'Verdana, sans-serif' }}>

          {/* Status Card */}
          <div className="card glass" style={{ marginBottom: '1.5rem', border: '1px solid var(--accent)' }}>
            <p style={{ fontSize: '0.65rem', opacity: 0.6, textTransform: 'uppercase' }}>Nivel Actual</p>
            <h2 style={{ color: 'var(--accent)', margin: '4px 0', fontSize: '1.2rem' }}>{metrics.level}</h2>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', margin: '12px 0' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: user?.is_certified ? '100%' : '20%' }}
                transition={{ duration: 0.8 }}
                style={{ height: '100%', background: user?.is_certified ? 'var(--success)' : 'var(--danger)' }}
              />
            </div>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: user?.is_certified ? 'var(--success)' : 'var(--danger)' }}>
              {user?.is_certified ? '✓ CERTIFICADO CONNEXO' : '⚠ CERTIFICACIÓN PENDIENTE'}
            </p>
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '2rem' }}>
            <div className="card glass">
              <p style={{ fontSize: '0.6rem', opacity: 0.5 }}>BILLETERA</p>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>${(user?.wallet_balance || 0).toFixed(2)}</h3>
            </div>
            <div className="card glass">
              <p style={{ fontSize: '0.6rem', opacity: 0.5 }}>SUELDO BASE</p>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>${metrics.base.toFixed(2)}</h3>
            </div>
            <div className="card glass">
              <p style={{ fontSize: '0.6rem', opacity: 0.5 }}>COMISIÓN</p>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{(metrics.rate * 100).toFixed(0)}%</h3>
            </div>
            <div className="card glass">
              <p style={{ fontSize: '0.6rem', opacity: 0.5 }}>VENTAS</p>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{sales.length}</h3>
            </div>
          </div>

          {/* Sales History */}
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', marginBottom: '1rem' }}>Historial de Ventas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sales.length === 0 ? (
              <p style={{ textAlign: 'center', opacity: 0.4, fontSize: '0.8rem', padding: '2rem' }}>
                Aún no hay ventas registradas.<br/>¡Registra tu primera venta!
              </p>
            ) : (
              sales.map(s => (
                <div key={s.id} className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>{s.customer_name}</p>
                    <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.5 }}>{s.plan_type} · {new Date(s.created_at).toLocaleDateString()}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, color: 'var(--accent)', fontWeight: 700 }}>+${s.commission_earned.toFixed(2)}</p>
                    <p style={{ margin: 0, fontSize: '0.65rem', opacity: 0.5 }}>${s.amount.toFixed(2)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      );

      case 'sales': return (
        <div style={{ padding: '0 1.5rem 100px', fontFamily: 'Verdana, sans-serif' }}>
          <h2 style={{ fontSize: '1.3rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Terminal de Ventas</h2>
          <p style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '2rem' }}>Comisión activa: {(metrics.rate * 100).toFixed(0)}%</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button disabled={isLoading} className="btn btn-primary" style={{ padding: '1.2rem', fontSize: '1rem', textTransform: 'uppercase' }} onClick={() => setSelectedPlan('PRO')}>
              Plan PRO — $97.00
            </button>
            <button disabled={isLoading} className="btn btn-primary" style={{ padding: '1.2rem', fontSize: '1rem', background: 'var(--accent-dark)', textTransform: 'uppercase' }} onClick={() => setSelectedPlan('ULTRA')}>
              Plan ULTRA — $179.00
            </button>
          </div>
          {selectedPlan && (
            <SaleForm
              plan={PLANS[selectedPlan]}
              onConfirm={(data) => handleRegisterSale(selectedPlan, data)}
              onCancel={() => setSelectedPlan(null)}
            />
          )}
        </div>
      );

      case 'network': return (
        <TeamManager
          users={team}
          currentUser={user}
          sales={sales}
          onAddUser={async (userData) => {
            const newUser = await dataService.addTeamMember(user.uid || user.id, userData);
            setTeam(prev => [...prev, newUser]);
            addNotification(`${newUser.full_name} agregado al equipo`, 'SUCCESS');
          }}
        />
      );

      case 'academy': return (
        <Academy
          user={user}
          onCertify={async () => {
            try {
              await dataService.certifyUser(user.uid || user.id);
              setUser(prev => ({ ...prev, is_certified: true }));
              addNotification('¡Certificación completada! Comisiones desbloqueadas.', 'SUCCESS');
              refreshData();
            } catch (err) {
              alert('Error: ' + err.message);
            }
          }}
        />
      );

      case 'profile': return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem 1.5rem 100px', fontFamily: 'Verdana, sans-serif', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 1.5rem' }}>
            {(user?.full_name || 'U').charAt(0).toUpperCase()}
          </div>
          <h2 style={{ textTransform: 'uppercase', fontSize: '1.2rem' }}>{user?.full_name}</h2>
          <p style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: '0.5rem' }}>{metrics.level}</p>
          <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>{user?.email}</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '2rem 0' }}>
            <div className="card glass">
              <p style={{ fontSize: '0.6rem', opacity: 0.5 }}>ROL</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.8rem' }}>{user?.role?.replace('_', ' ')}</p>
            </div>
            <div className="card glass">
              <p style={{ fontSize: '0.6rem', opacity: 0.5 }}>ESTADO</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.8rem', color: user?.is_certified ? 'var(--success)' : 'var(--danger)' }}>
                {user?.is_certified ? 'CERTIFICADO' : 'PENDIENTE'}
              </p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn" style={{ background: 'var(--danger)', color: 'white', width: '100%', padding: '1rem', textTransform: 'uppercase' }}>
            Cerrar Sesión
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
          />
          <main style={{ flex: 1 }}>{renderContent()}</main>
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} role={user?.role} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default App;
