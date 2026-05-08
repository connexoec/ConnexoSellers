// ROLES & TIERS v2.1
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  DISTRIBUTOR: 'DISTRIBUTOR',
  SELLER: 'SELLER'
};

export const PLANS = {
  PRO: { id: 'PLAN_PRO', price: 97.00, label: 'Plan PRO' },
  ULTRA: { id: 'PLAN_ULTRA', price: 179.00, label: 'Plan ULTRA' }
};

// MOCK DATA
const INITIAL_USERS = [
  {
    id: '1',
    name: 'Super Admin',
    email: 'admin@connexo.com',
    password: 'admin',
    role: ROLES.SUPER_ADMIN,
    is_certified: true
  },
  {
    id: '2',
    name: 'Partner Carlos (P1)',
    email: 'partner@connexo.com',
    password: 'distri',
    role: ROLES.DISTRIBUTOR,
    is_certified: true,
    parent_id: '1'
  },
  {
    id: '3',
    name: 'Vendedor Maria',
    email: 'vendedora@connexo.com',
    password: 'maria',
    role: ROLES.SELLER,
    is_certified: false,
    parent_id: '2'
  }
];

// MOCK SERVICE v2.1
export const mockStore = {
  getUsers: () => INITIAL_USERS,

  // Calculate Levels & Commissions Logic v2.2
  calculateMetrics: (user, allUsers, allSales) => {
    if (!user.is_certified) return { rate: 0, base: 0, level: 'BLOQUEADO' };

    const mySales = allSales.filter(s => s.seller_id === user.id);
    const mySaleCount = mySales.length;

    // SELLER LOGIC
    if (user.role === ROLES.SELLER) {
      if (mySaleCount >= 31) return { rate: 0.09, base: 300, level: 'VENDEDOR ULTRA' };
      if (mySaleCount >= 20) return { rate: 0.07, base: 250, level: 'VENDEDOR PRO' };
      return { rate: 0.07, base: 0, level: 'VENDEDOR PRO' };
    }

    // DISTRIBUTOR LOGIC (Hierarchical)
    if (user.role === ROLES.DISTRIBUTOR) {
      // Get team sales (Self + direct reports)
      const teamIds = [user.id, ...allUsers.filter(u => u.parent_id === user.id).map(u => u.id)];
      const teamSalesCount = allSales.filter(s => teamIds.includes(s.seller_id)).length;
      
      if (teamSalesCount >= 201) return { rate: 0.18, base: 600, level: 'PARTNER 3' };
      if (teamSalesCount >= 101) return { rate: 0.15, base: 600, level: 'PARTNER 2' };
      if (teamSalesCount >= 50) return { rate: 0.12, base: 500, level: 'PARTNER 1' };
      return { rate: 0.10, base: 0, level: 'PARTNER BASIC' };
    }

    return { rate: 0, base: 0, level: 'ADMIN' };
  },

  // Real-time Trigger for Commission
  calculateSaleCommission: (planPrice, rate, isCertified) => {
    return isCertified ? planPrice * (rate || 0) : 0;
  },

  // STRESS TEST HELPER (Simulate Massive Load)
  generateStressData: (userId, count = 100) => {
    const stressSales = [];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      stressSales.push({
        id: `stress_${i}_${now}`,
        seller_id: userId,
        plan_type: i % 2 === 0 ? 'PLAN_PRO' : 'PLAN_ULTRA',
        amount: i % 2 === 0 ? 97.00 : 179.00,
        commission: 0, // Will be calculated by metrics
        timestamp: now - (i * 3600000) // One hour apart
      });
    }
    return stressSales;
  }
};
