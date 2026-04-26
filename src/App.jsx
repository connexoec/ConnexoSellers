import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from './components/layout/BottomNav';
import Header from './components/layout/Header';
import Login from './components/auth/Login';
import TeamManager from './components/team/TeamManager';
import Onboarding from './components/onboarding/Onboarding';
import SaleForm from './components/sales/SaleForm';
import Academy from './components/academy/Academy';
import { dataService, PLANS } from './services/dataService';
import { auth } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [team, setTeam] = useState([]);
  const [sales, setSales] = useState([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [notifications, setNotifications] = useState([
    { id: 1, message: "Conectado a Firebase Real-Time v2.2", type: 'INFO', read: false }
  ]);

  const [metrics, setMetrics] = useState({ rate: 0, base: 0, level: 'SINCRONIZANDO...' });

  // 1. Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Suscribirse a cambios en el perfil del usuario en Firestore
        const unsubProfile = dataService.subscribeToProfile(firebaseUser.uid, (profileData) => {
          const fullUser = { uid: firebaseUser.uid, email: firebaseUser.email, ...profileData };
          setUser(fullUser);
          setIsAuthenticated(true);
          setIsLoading(false);
        });
        return () => unsubProfile();
      } else {
        setIsAuthenticated(false);
        setUser(null);
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch Metrics & Team when User changes
  useEffect(() => {
    if (isAuthenticated && user) {
      refreshMetrics();
    }
  }, [isAuthenticated, user?.uid]);

  const refreshMetrics = async () => {
    try {
      const [newMetrics, teamData] = await Promise.all([
        dataService.getMetrics(user),
        user.role !== 'SELLER' ? dataService.getTeam(user.uid) : Promise.resolve([])
      ]);
      setMetrics(newMetrics);
      setTeam(teamData);
    } catch (err) {
      console.error("Error al refrescar métricas:", err);
    }
  };

  const handleLogin = async (email, password) => {
    setIsLoading(true);
    try {
      await dataService.login(email, password);
      setShowOnboarding(true);
    } catch (err) {
      alert("Error: " + err.message);
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await dataService.logout();
    setIsAuthenticated(false);
    setUser(null);
    setSales([]);
    setTeam([]);
    setActiveTab('dashboard');
    setShowOnboarding(false);
    setIsLoading(false);
  };

  const handleRegisterSale = async (planKey, customerData) => {
    setIsLoading(true);
    try {
      const newSale = await dataService.registerSale(
        user.uid, 
        planKey, 
        customerData, 
        metrics.rate, 
        user.is_certified
      );
      setSales([newSale, ...sales]);
      setSelectedPlan(null);
      setNotifications([{ id: Date.now(), message: "Venta sincronizada en la nube", type: 'SUCCESS', read: false }, ...notifications]);
      refreshMetrics();
    } catch (err) {
      alert("Error en Firebase: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !isAuthenticated) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--accent)', fontFamily: 'Verdana', padding: '2rem', textAlign: 'center' }}>
        <div className="spinner" style={{ border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid var(--accent)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '2rem' }}></div>
        <p>Iniciando Ecosistema Firebase...</p>
        <p style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '2rem' }}>
          Si esta pantalla no desaparece, verifica que tus variables de entorno en el archivo .env sean correctas.
        </p>
      </div>
    );
  }

  const renderContent = () => {
    switch(activeTab) {
      case 'dashboard': return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '0 1.5rem 100px', fontFamily: 'Verdana, sans-serif' }}>
          <div className="card glass" style={{ marginBottom: '1.5rem', border: '1px solid var(--accent)' }}>
            <p style={{ fontSize: '0.7rem', opacity: 0.7, textTransform: 'uppercase' }}>Cloud Sync: Activo</p>
            <h2 style={{ color: 'var(--accent)', margin: '4px 0', fontSize: '1.2rem' }}>{metrics.level}</h2>
            <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden', margin: '12px 0' }}>
                <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: user?.is_certified ? '100%' : '20%' }} 
                    style={{ height: '100%', background: user?.is_certified ? 'var(--success)' : 'var(--danger)' }} 
                />
            </div>
            <p style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                {user?.is_certified ? '✓ CERTIFICADO' : '⚠ PENDIENTE'}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '2rem' }}>
            <div className="card glass">
                <p style={{ fontSize: '0.6rem', opacity: 0.6 }}>BILLETERA</p>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>${(user?.wallet_balance || 0).toFixed(2)}</h3>
            </div>
            <div className="card glass">
                <p style={{ fontSize: '0.6rem', opacity: 0.6 }}>BASE</p>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>${metrics.base.toFixed(2)}</h3>
            </div>
          </div>

          <h3 style={{ fontSize: '1rem', textTransform: 'uppercase' }}>Transacciones Cloud</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '1rem' }}>
            {sales.length === 0 ? (
              <p style={{ textAlign: 'center', opacity: 0.4, fontSize: '0.8rem', padding: '2rem' }}>Explora tu consola Firebase para el historial completo.</p>
            ) : (
              sales.map(s => (
                <div key={s.id} className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem' }}>{s.customer_name}</p>
                        <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.6 }}>{s.plan_type}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, color: 'var(--accent)', fontWeight: 700 }}>+${(s.commission_earned || 0).toFixed(2)}</p>
                    </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      );
      case 'sales': return (
        <div style={{ padding: '0 1.5rem', fontFamily: 'Verdana, sans-serif' }}>
            <h2 style={{ fontSize: '1.4rem', textTransform: 'uppercase' }}>Terminal Cloud</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
                <button 
                    disabled={isLoading}
                    className="btn btn-primary" 
                    onClick={() => setSelectedPlan('PRO')}
                >
                    Plan PRO ($97.00)
                </button>
                <button 
                    disabled={isLoading}
                    className="btn btn-primary" 
                    style={{ background: 'var(--accent-dark)' }}
                    onClick={() => setSelectedPlan('ULTRA')}
                >
                    Plan ULTRA ($179.00)
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
      case 'network': return <TeamManager users={team} currentUser={user} onAddUser={() => refreshMetrics()} sales={[]} />;
      case 'academy': return (
        <Academy 
          user={user} 
          onCertify={async () => {
            try {
              await dataService.certifyUser(user.uid);
              // onSnapshot will auto-update user state
              setNotifications([{ id: Date.now(), message: "¡Certificación completada! Las comisiones están activas.", type: 'SUCCESS', read: false }, ...notifications]);
            } catch (err) {
              alert("Error al certificar: " + err.message);
            }
          }} 
        />
      );
      case 'profile': return (
        <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'Verdana, sans-serif' }}>
            <h2 style={{ textTransform: 'uppercase' }}>{user?.full_name || user?.email}</h2>
            <p style={{ color: 'var(--accent)', fontWeight: 700 }}>{metrics.level}</p>
            <button onClick={handleLogout} className="btn" style={{ background: 'var(--danger)', color: 'white', marginTop: '3rem', width: '100%', textTransform: 'uppercase' }}>Cerrar Sesión Cloud</button>
        </div>
      );
      default: return null;
    }
  };

  return (
    <AnimatePresence mode="wait">
      {!isAuthenticated ? (
        <Login 
          onLogin={handleLogin}
          onAdminBypass={(adminUser) => {
            setUser(adminUser);
            setIsAuthenticated(true);
            setShowOnboarding(true);
            setIsLoading(false);
          }}
        />
      ) : showOnboarding ? (
        <Onboarding user={user} onComplete={() => setShowOnboarding(false)} />
      ) : (
        <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Header 
            user={{ name: user?.full_name || user?.email, ...user }} 
            notificationCount={notifications.filter(n => !n.read).length}
            onShowNotifications={() => {
              alert(notifications.map(n => n.message).join('\n'));
              setNotifications(notifications.map(n => ({ ...n, read: true })));
            }}
          />
          <main style={{ flex: 1 }}>{renderContent()}</main>
          <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} role={user.role} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default App;
