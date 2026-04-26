// ============================================================
// dataService.js — Modo Local (Sin Backend)
// Toda la lógica de negocio y datos viven en memoria.
// Listo para conectar a cualquier backend en el futuro.
// ============================================================

export const PLANS = {
  PRO:   { id: 'PRO',   price: 97.00,  label: 'Plan PRO' },
  ULTRA: { id: 'ULTRA', price: 179.00, label: 'Plan ULTRA' }
};

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  DISTRIBUTOR: 'DISTRIBUTOR',
  SELLER:      'SELLER'
};

// ---------- Estado local en memoria ----------
let _currentUser = null;
let _sales = [];
let _profiles = [
  {
    uid: 'admin-001',
    id:  'admin-001',
    full_name:      'Super Admin',
    email:          'admin@connexo.com',
    password:       'admin123',
    role:           'SUPER_ADMIN',
    is_certified:   true,
    wallet_balance: 0,
    parent_id:      ''
  }
];

// ---------- Utilidades ----------
const delay = (ms = 400) => new Promise(r => setTimeout(r, ms));

function calcMetrics(user) {
  const uid = user.uid || user.id;

  if (!user.is_certified) return { rate: 0, base: 0, level: 'BLOQUEADO' };

  // Ventas propias
  const mySales   = _sales.filter(s => s.seller_id === uid).length;
  // Ventas del equipo (propias + de hijos directos)
  const teamIds   = _profiles.filter(p => p.parent_id === uid).map(p => p.uid);
  const teamSales = _sales.filter(s => teamIds.includes(s.seller_id) || s.seller_id === uid).length;

  if (user.role === ROLES.SELLER) {
    if (mySales >= 31) return { rate: 0.09, base: 300, level: 'VENDEDOR ULTRA' };
    if (mySales >= 20) return { rate: 0.07, base: 250, level: 'VENDEDOR PRO'   };
    return              { rate: 0.05, base: 0,   level: 'VENDEDOR BASIC'        };
  }

  if (user.role === ROLES.DISTRIBUTOR) {
    if (teamSales >= 201) return { rate: 0.18, base: 600, level: 'PARTNER 3'    };
    if (teamSales >= 101) return { rate: 0.15, base: 600, level: 'PARTNER 2'    };
    if (teamSales >= 50)  return { rate: 0.12, base: 500, level: 'PARTNER 1'    };
    return                { rate: 0.10, base: 0,   level: 'PARTNER BASIC'       };
  }

  return { rate: 0, base: 0, level: 'SUPER ADMIN' };
}

// ---------- Servicio ----------
export const dataService = {

  // 1. LOGIN
  async login(email, password) {
    await delay();
    const profile = _profiles.find(
      p => p.email === email && p.password === password
    );
    if (!profile) throw new Error('Credenciales incorrectas. Verifica tu email y contraseña.');
    _currentUser = { ...profile };
    return _currentUser;
  },

  // 2. LOGOUT
  async logout() {
    await delay(200);
    _currentUser = null;
  },

  // 3. METRICS
  async getMetrics(user) {
    await delay(300);
    return calcMetrics(user);
  },

  // 4. SALES
  async registerSale(userId, planKey, customerData, currentRate, isCertified) {
    await delay();
    const plan       = PLANS[planKey];
    const commission = isCertified ? plan.price * (currentRate || 0) : 0;

    const sale = {
      id:               `sale-${Date.now()}`,
      seller_id:        userId,
      plan_type:        planKey,
      amount:           plan.price,
      commission_earned: commission,
      customer_name:    customerData.name,
      customer_phone:   customerData.phone,
      status:           'COMPLETED',
      created_at:       new Date().toISOString()
    };

    _sales.unshift(sale);

    // Actualizar billetera del perfil local
    const profile = _profiles.find(p => p.uid === userId);
    if (profile) profile.wallet_balance = (profile.wallet_balance || 0) + commission;

    return sale;
  },

  async getSales(userId) {
    await delay(300);
    return _sales.filter(s => s.seller_id === userId);
  },

  // 5. TEAM
  async getTeam(parentId) {
    await delay(300);
    return _profiles
      .filter(p => p.parent_id === parentId)
      .map(({ password: _, ...rest }) => rest); // No exponer contraseñas
  },

  async addTeamMember(parentId, userData) {
    await delay();
    const newProfile = {
      uid:            `user-${Date.now()}`,
      id:             `user-${Date.now()}`,
      full_name:      userData.name,
      email:          userData.email,
      password:       userData.password || 'connexo123',
      role:           userData.role || ROLES.SELLER,
      is_certified:   false,
      wallet_balance: 0,
      parent_id:      parentId,
      created_at:     new Date().toISOString()
    };
    _profiles.push(newProfile);
    const { password: _, ...safeProfile } = newProfile;
    return safeProfile;
  },

  // 6. CERTIFICATION
  async certifyUser(userId) {
    await delay();
    const profile = _profiles.find(p => p.uid === userId || p.id === userId);
    if (!profile) throw new Error('Usuario no encontrado.');
    profile.is_certified = true;
    // Si el usuario actual es el mismo, actualizarlo
    if (_currentUser && (_currentUser.uid === userId)) {
      _currentUser.is_certified = true;
    }
    return true;
  }
};
