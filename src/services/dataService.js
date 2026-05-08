import { supabase } from '../lib/supabase';

export const PLANS = {
  PRO:   { id: 'PRO',   price: 97.00,  label: 'Plan PRO' },
  ULTRA: { id: 'ULTRA', price: 179.00, label: 'Plan ULTRA' }
};

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  DISTRIBUTOR: 'DISTRIBUTOR',
  SELLER:      'SELLER'
};

export const TIERS = {
  SELLER: [
    { id: 'BASIC', label: 'VENDEDOR BASIC', rate: 0, base: 0 },
    { id: 'PRO',   label: 'VENDEDOR PRO',   rate: 0.07, base: 250 },
    { id: 'ULTRA', label: 'VENDEDOR ULTRA', rate: 0.09, base: 300 },
  ],
  DISTRIBUTOR: [
    { id: 'BASIC', label: 'DISTRIBUIDOR BASIC', rate: 0, base: 0 },
    { id: 'D1',    label: 'DISTRIBUIDOR 1',     rate: 0.12, base: 500 },
    { id: 'D2',    label: 'DISTRIBUIDOR 2',     rate: 0.15, base: 600 },
    { id: 'D3',    label: 'DISTRIBUIDOR 3',     rate: 0.18, base: 600 },
  ]
};

let _currentUser = null;

// Cache simple de métricas (30 segundos TTL) para no spamear Supabase
const _metricsCache = new Map();

async function calcMetrics(user) {
  const uid = user.id || user.uid;
  const cacheKey = `${uid}-${user.role}-${user.tier || 'auto'}-${user.is_certified}`;
  const cached = _metricsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 30_000) return cached.data;

  const cache = (data) => { _metricsCache.set(cacheKey, { data, ts: Date.now() }); return data; };

  if (!user.is_certified) return cache({ rate: 0, base: 0, level: 'BLOQUEADO' });

  // Fecha de inicio del conteo (cuando el admin asigna categoría)
  const startDate = user.tier_start_date || null;

  // Helper para contar ventas (filtra por fecha si hay tier_start_date)
  const countSales = (query) => startDate ? query.gte('created_at', startDate) : query;

  // Priorizar nivel manual si existe — pero seguir contando desde tier_start_date
  // para saber cuándo debe subir al siguiente nivel
  if (user.tier) {
    const roleTiers = user.role === ROLES.SELLER ? TIERS.SELLER : TIERS.DISTRIBUTOR;
    const manualTier = roleTiers.find(t => t.id === user.tier);
    if (manualTier) {
      // Contar ventas desde la asignación para detectar si ya subió de nivel
      if (user.role === ROLES.SELLER) {
        let total = 0;
        try {
          const { count: salesSinceAssignment } = await countSales(
            supabase.from('sales').select('*', { count: 'exact', head: true }).eq('seller_id', uid)
          );
          total = salesSinceAssignment || 0;
        } catch (e) {
          console.warn("calcMetrics fallback for manual SELLER:", e.message);
        }
        // Si ya superó los umbrales del siguiente nivel, subir automáticamente
        if (total >= 31) return cache({ rate: 0.09, base: 300, level: 'VENDEDOR ULTRA', salesCount: total });
        if (total >= 20) return cache({ rate: 0.07, base: 250, level: 'VENDEDOR PRO',   salesCount: total });
      }
      return cache({ rate: manualTier.rate, base: manualTier.base, level: manualTier.label, salesCount: 0 });
    }
  }

  // ─── VENDEDOR (Auto) ──────────────────────────────────────────────────
  if (user.role === ROLES.SELLER) {
    let total = 0;
    try {
      const { count: mySales } = await countSales(
        supabase.from('sales').select('*', { count: 'exact', head: true }).eq('seller_id', uid)
      );
      total = mySales || 0;
    } catch (e) {
      console.warn("calcMetrics fallback for SELLER:", e.message);
    }
    if (total >= 31) return cache({ rate: 0.09, base: 300, level: 'VENDEDOR ULTRA', salesCount: total });
    if (total >= 20) return cache({ rate: 0.07, base: 250, level: 'VENDEDOR PRO',   salesCount: total });
    return cache({ rate: 0.07, base: 0, level: 'VENDEDOR BASIC', salesCount: total, isPreview: true });
  }

  // ─── DISTRIBUIDOR (Auto) ──────────────────────────────────────────────
  if (user.role === ROLES.DISTRIBUTOR) {
    let total = 0;
    try {
      const { data: team } = await supabase.from('profiles').select('id').eq('parent_id', uid);
      const teamIds = [uid, ...(team?.map(t => t.id) || [])];

      const { count: teamSales } = await countSales(
        supabase.from('sales').select('*', { count: 'exact', head: true }).in('seller_id', teamIds)
      );
      total = teamSales || 0;
    } catch (e) {
      console.warn("calcMetrics fallback for DISTRIBUTOR:", e.message);
    }
    if (total >= 201) return cache({ rate: 0.18, base: 600, level: 'DISTRIBUIDOR 3', salesCount: total });
    if (total >= 101) return cache({ rate: 0.15, base: 600, level: 'DISTRIBUIDOR 2', salesCount: total });
    if (total >= 50)  return cache({ rate: 0.12, base: 500, level: 'DISTRIBUIDOR 1', salesCount: total });
    return cache({ rate: 0.12, base: 0, level: 'DISTRIBUIDOR BASIC', salesCount: total, isPreview: true });
  }

  return cache({ rate: 0, base: 0, level: 'SUPER ADMIN' });
}

export const dataService = {
  async login(email, password, selectedRole = null) {
    // 1. Validación de Super Admins Principales
    const hardcodedAdmins = {
      'emapmvisual@gmail.com': { password: 'ConnexoApp666', name: 'Ema PM (Admin)' },
      'thony.karter@gmail.com': { password: 'ConnexoApp666', name: 'Thony Karter (Admin)' }
    };

    const adminInfo = hardcodedAdmins[email];

    if (adminInfo && password === adminInfo.password) {
      const { data: existingAdmin } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .single();

      if (existingAdmin) {
        _currentUser = {
          ...existingAdmin,
          permiso_eliminar_sede: email === 'thony.karter@gmail.com',
          sede_asignada: 'GLOBAL'
        };
        return _currentUser;
      } else {
        // Crear el Super Admin si no existe en la base de datos
        const newAdmin = {
          full_name: adminInfo.name,
          email: email,
          password: password,
          role: ROLES.SUPER_ADMIN,
          is_certified: true,
          wallet_balance: 0,
          parent_id: null
        };
        const { data: insertedAdmin, error } = await supabase
          .from('profiles')
          .insert([newAdmin])
          .select()
          .single();

        if (error) {
          console.error("Error creando Admin:", error);
          throw new Error('Error de Supabase al crear Admin: ' + error.message);
        }
        _currentUser = {
          ...insertedAdmin,
          permiso_eliminar_sede: email === 'thony.karter@gmail.com',
          sede_asignada: 'GLOBAL'
        };
        return _currentUser;
      }
    }

    // 2. Login normal para el resto de usuarios
    let userData = null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();
        
      if (!error && data) {
        userData = data;
      } else {
        throw new Error('No encontrado en Supabase');
      }
    } catch (err) {
      // Buscar en caché local (modo offline o usuarios caídos por schema)
      const cached = localStorage.getItem('connexo_team');
      if (cached) {
        const team = JSON.parse(cached);
        const localMatch = team.find(t => t.email === email && t.password === password);
        if (localMatch) {
          userData = localMatch;
        }
      }
    }
      
    if (!userData) {
      throw new Error('Credenciales incorrectas. Verifica tu email y contraseña.');
    }

    // Validar que el rol seleccionado en la UI coincida con el rol real
    if (selectedRole) {
      const roleMap = {
        'VENDEDOR':    'SELLER',
        'DISTRIBUIDOR': 'DISTRIBUTOR'
      };
      const expectedRole = roleMap[selectedRole];
      if (expectedRole && userData.role !== expectedRole) {
        throw new Error(`Acceso denegado. Tu cuenta está registrada como ${userData.role === 'SELLER' ? 'Vendedor' : 'Distribuidor'}.`);
      }
    }

    _currentUser = userData;
    return _currentUser;
  },

  async logout() {
    _currentUser = null;
  },

  async getMetrics(user) {
    return await calcMetrics(user);
  },

  async getUserBadges(userId) {
    // Intentar leer de base de datos si existiera, o usar fallback
    try {
      const { data, error } = await supabase.from('profiles').select('badges').eq('id', userId).single();
      if (!error && data?.badges) return data.badges;
    } catch (e) {
      // Ignore if column doesn't exist
    }
    const local = localStorage.getItem(`connexo_badges_${userId}`);
    return local ? JSON.parse(local) : [];
  },

  async saveUserBadges(userId, badges) {
    try {
      await supabase.from('profiles').update({ badges }).eq('id', userId);
    } catch (e) {
      // Ignore if column doesn't exist
    }
    localStorage.setItem(`connexo_badges_${userId}`, JSON.stringify(badges));
  },

  async registerSale(userId, planKey, customerData, currentRate, isCertified, billingCycle = 'annually', sedeId = null) {
    const isMonthly = billingCycle === 'monthly';
    const basePrice = planKey === 'PRO' ? (isMonthly ? 7.00 : 97.00) : (isMonthly ? 15.00 : 179.00);

    // Obtener el perfil fresco de Supabase para calcular la tasa real de forma ultra-segura en el backend
    let realRate = 0;
    try {
      const { data: userProfile } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (userProfile) {
        const freshMetrics = await calcMetrics(userProfile);
        realRate = freshMetrics.rate || 0;
        isCertified = userProfile.is_certified;
      }
    } catch (err) {
      console.warn("Failed to fetch profile in registerSale, using fallbacks:", err);
      realRate = currentRate || (isCertified ? 0.07 : 0);
    }

    // Si está certificado pero por alguna razón la tasa sigue siendo 0, aplicar el fallback de comisión base (7% para vendedor / 12% para distribuidor)
    if (isCertified && realRate === 0) {
      realRate = 0.07;
    }

    const commission = isCertified && realRate > 0 ? basePrice * realRate : 0;

    const currentDate = new Date();
    const monthlyBillingDateNote = `[COBRO MENSUAL: DÍA ${currentDate.getDate()} DE CADA MES]`;
    const notes = isMonthly
      ? (customerData.notes ? `${monthlyBillingDateNote} ${customerData.notes}` : monthlyBillingDateNote)
      : (customerData.notes || null);

    const newSale = {
      seller_id: userId,
      plan_type: `${planKey} ${isMonthly ? 'MENSUAL' : 'ANUAL'}`,
      amount: basePrice,
      commission_earned: commission,
      customer_name: customerData.name,
      customer_phone: customerData.phone,
      customer_email: customerData.email || null,
      customer_company: customerData.company || null,
      customer_notes: notes,
      status: 'COMPLETED',
      sede_id: sedeId || 'sede-ec-1' // Auto-Etiquetado con contexto activo
    };

    try {
      const { data: sale, error } = await supabase
        .from('sales')
        .insert([newSale])
        .select()
        .single();

      if (error) throw new Error(error.message);

      const completeSale = { ...newSale, ...sale };
      const cached = localStorage.getItem('connexo_sales') || '[]';
      const sales = JSON.parse(cached);
      if (!sales.some(s => s.id === completeSale.id)) {
        sales.push(completeSale);
        localStorage.setItem('connexo_sales', JSON.stringify(sales));
      }

      // Actualizar billetera del SELLER localmente y en db
      if (commission > 0) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('wallet_balance')
          .eq('id', userId)
          .single();
          
        if (profile) {
          const newBalance = Number(profile.wallet_balance || 0) + commission;
          await supabase
            .from('profiles')
            .update({ wallet_balance: newBalance })
            .eq('id', userId);
          
          if (_currentUser && _currentUser.id === userId) {
              _currentUser.wallet_balance = newBalance;
          }
        }
      }

      // ---------------------------------------------------
      // LÓGICA DE DISTRIBUIDOR (COMISIÓN POR JERARQUÍA / OVERRIDE)
      // ---------------------------------------------------
      let parentOverride = 0;
      let parentId = null;
      
      try {
        const { data: profile } = await supabase.from('profiles').select('parent_id').eq('id', userId).single();
        if (profile?.parent_id) {
          parentId = profile.parent_id;
          const { data: parentProfile } = await supabase.from('profiles').select('*').eq('id', parentId).single();
          // El padre debe ser distribuidor certificado para ganar sobreventa
          if (parentProfile && parentProfile.role === 'DISTRIBUTOR' && parentProfile.is_certified) {
             const parentMetrics = await calcMetrics(parentProfile);
             const parentRate = parentMetrics.rate || 0;
             if (parentRate > 0) {
               parentOverride = basePrice * parentRate;
             }
          }
        }
      } catch (e) {
        console.warn("⚠️ Fallback calculando override de distribuidor", e.message);
        const cachedTeam = localStorage.getItem('connexo_team') || '[]';
        const team = JSON.parse(cachedTeam);
        const userLocal = team.find(t => t.id === userId);
        if (userLocal && userLocal.parent_id) {
           parentId = userLocal.parent_id;
           const parentLocal = team.find(t => t.id === parentId);
           if (parentLocal && parentLocal.role === 'DISTRIBUTOR' && parentLocal.is_certified) {
             const parentRate = 0.12; // Base para distribuidor
             if (parentRate > 0) {
                parentOverride = basePrice * parentRate;
             }
           }
        }
      }

      if (parentOverride > 0 && parentId) {
        try {
          const { data: parentData } = await supabase.from('profiles').select('wallet_balance').eq('id', parentId).single();
          if (parentData) {
            const newParentBalance = Number(parentData.wallet_balance || 0) + parentOverride;
            await supabase.from('profiles').update({ wallet_balance: newParentBalance }).eq('id', parentId);
          }
        } catch(e) { /* ignore db error for parent wallet */ }
        
        // Cache local del padre
        const cachedTeam = localStorage.getItem('connexo_team') || '[]';
        let team = JSON.parse(cachedTeam);
        const pIdx = team.findIndex(t => t.id === parentId);
        if (pIdx !== -1) {
           team[pIdx].wallet_balance = Number(team[pIdx].wallet_balance || 0) + parentOverride;
           localStorage.setItem('connexo_team', JSON.stringify(team));
        }
      }

      _metricsCache.clear(); // ⚡ Invalidad cache de métricas en tiempo real
      return completeSale;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para registerSale:", err.message);
      const cached = localStorage.getItem('connexo_sales') || '[]';
      const sales = JSON.parse(cached);
      const newLocalSale = {
        ...newSale,
        id: `sale-${Date.now()}`,
        created_at: new Date().toISOString()
      };
      sales.push(newLocalSale);
      localStorage.setItem('connexo_sales', JSON.stringify(sales));
      
      if (commission > 0) {
        if (_currentUser && _currentUser.id === userId) {
          _currentUser.wallet_balance = Number(_currentUser.wallet_balance || 0) + commission;
        }
        const cachedTeam = localStorage.getItem('connexo_team') || '[]';
        let team = JSON.parse(cachedTeam);
        const idx = team.findIndex(t => t.id === userId);
        if (idx !== -1) {
          team[idx].wallet_balance = Number(team[idx].wallet_balance || 0) + commission;
          localStorage.setItem('connexo_team', JSON.stringify(team));
        }
      }
      
      _metricsCache.clear();
      return newLocalSale;
    }
  },

  // Sales solo propias (vendedor)
  async getSales(userId) {
    let supabaseData = [];
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('seller_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      supabaseData = data || [];
    } catch (err) {
      console.warn("⚠️ Error en Supabase para getSales, usando LocalStorage:", err.message);
    }
    
    const cached = localStorage.getItem('connexo_sales');
    if (cached) {
      const localSales = JSON.parse(cached).filter(s => s.seller_id === userId);
      localSales.forEach(localSale => {
        if (!supabaseData.some(su => su.id === localSale.id)) {
          supabaseData.push(localSale);
        }
      });
    }
    return supabaseData.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  },

  // Sales de todo el equipo (distribuidor / super admin)
  async getSalesForTeam(userId, role) {
    let supabaseData = [];
    let teamIds = [userId];
    
    try {
      if (role !== ROLES.SUPER_ADMIN) {
        const { data: team } = await supabase
          .from('profiles')
          .select('id')
          .eq('parent_id', userId);
        if (team?.length) teamIds = [userId, ...team.map(m => m.id)];
      }

      let query = supabase.from('sales').select('*').order('created_at', { ascending: false });
      if (role !== ROLES.SUPER_ADMIN) {
        query = query.in('seller_id', teamIds);
      }
      
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      supabaseData = data || [];
    } catch (err) {
      console.warn("⚠️ Error en Supabase para getSalesForTeam, usando LocalStorage:", err.message);
      if (role !== ROLES.SUPER_ADMIN) {
        const localTeam = JSON.parse(localStorage.getItem('connexo_team') || '[]');
        const children = localTeam.filter(t => t.parent_id === userId).map(t => t.id);
        teamIds = [userId, ...children];
      }
    }
    
    const cached = localStorage.getItem('connexo_sales');
    if (cached) {
      const localSales = JSON.parse(cached);
      const filteredLocal = role === ROLES.SUPER_ADMIN 
        ? localSales 
        : localSales.filter(s => teamIds.includes(s.seller_id));
        
      filteredLocal.forEach(localSale => {
        if (!supabaseData.some(su => su.id === localSale.id)) {
          supabaseData.push(localSale);
        }
      });
    }
    return supabaseData.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async getTeam(parentId) {
    let supabaseData = [];
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('parent_id', parentId)
        .order('created_at', { ascending: true });
        
      if (error) throw new Error(error.message);
      supabaseData = data ? data.map(({ password, ...rest }) => rest) : [];
    } catch (err) {
      console.warn("⚠️ Error en Supabase para getTeam, usando solo LocalStorage:", err.message);
    }

    const cached = localStorage.getItem('connexo_team');
    if (cached) {
      const localTeam = JSON.parse(cached).filter(t => t.parent_id === parentId).map(({ password, ...rest }) => rest);
      
      // Purge zombies
      const allLocalTeam = JSON.parse(cached);
      const updatedLocalTeam = allLocalTeam.filter(l => {
         if (typeof l.id === 'string' && l.id.startsWith('profile-')) return true; // keep pure offline
         return supabaseData.some(su => su.id === l.id) || l.parent_id !== parentId; // keep if found in cloud OR not belonging to this specific team query
      });
      if (updatedLocalTeam.length !== allLocalTeam.length) localStorage.setItem('connexo_team', JSON.stringify(updatedLocalTeam));

      supabaseData = supabaseData.map(su => {
        const localMatch = localTeam.find(l => l.id === su.id || l.email === su.email);
        if (localMatch && !su.sede_asignada && localMatch.sede_asignada) {
          return { ...su, sede_asignada: localMatch.sede_asignada };
        }
        return su;
      });

      localTeam.forEach(localUser => {
        if (!supabaseData.some(su => su.id === localUser.id || su.email === localUser.email)) {
          supabaseData.push(localUser);
        }
      });
    }
    return supabaseData;
  },

  async addTeamMember(parentId, userData) {
    const newProfile = {
      full_name: userData.name,
      email: userData.email,
      password: userData.password || 'connexo123',
      role: userData.role || ROLES.SELLER,
      tier: userData.tier || null,
      tier_start_date: userData.tier ? new Date().toISOString() : null,
      is_certified: false,
      wallet_balance: 0,
      parent_id: parentId,
      sede_asignada: userData.sede_asignada || null
    };

    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert([newProfile])
        .select()
        .single();

      if (error) throw new Error(error.message);
      const { password, ...safeProfile } = data;
      
      const completeProfile = { ...newProfile, ...safeProfile };
      const cached = localStorage.getItem('connexo_team') || '[]';
      const team = JSON.parse(cached);
      if (!team.some(t => t.email === completeProfile.email)) {
        team.push(completeProfile);
        localStorage.setItem('connexo_team', JSON.stringify(team));
      }
      return completeProfile;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para agregar miembro de equipo:", err.message);
      const cached = localStorage.getItem('connexo_team') || '[]';
      const team = JSON.parse(cached);
      
      const newLocalProfile = {
        ...newProfile,
        id: `profile-${Date.now()}`
      };
      
      // Chequear duplicado manual offline
      if (team.some(t => t.email === newLocalProfile.email)) {
        throw new Error('Ya existe un usuario con este correo (Offline).');
      }
      
      team.push(newLocalProfile);
      localStorage.setItem('connexo_team', JSON.stringify(team));
      
      const { password, ...safeProfile } = newLocalProfile;
      return safeProfile;
    }
  },

  async getProfile(userId) {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error) throw error;
      return data;
    } catch(e) {
      const cached = localStorage.getItem('connexo_team');
      if (cached) {
         return JSON.parse(cached).find(t => t.id === userId) || null;
      }
      return null;
    }
  },

  async certifyUser(userId) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_certified: true })
        .eq('id', userId);
        
      if (error) throw new Error(error.message);
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para certifyUser:", err.message);
      const cached = localStorage.getItem('connexo_team') || '[]';
      let team = JSON.parse(cached);
      const idx = team.findIndex(t => t.id === userId || t.uid === userId);
      if (idx !== -1) {
        team[idx].is_certified = true;
        localStorage.setItem('connexo_team', JSON.stringify(team));
      } else {
        throw new Error('Usuario no encontrado en caché local al certificar');
      }
    }
    
    if (_currentUser && (_currentUser.id === userId || _currentUser.uid === userId)) {
      _currentUser.is_certified = true;
    }
    _metricsCache.clear(); // ⚡ Invalidad cache de métricas en tiempo real
    return true;
  },

  async getAllProfiles() {
    let supabaseData = [];
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      supabaseData = data || [];
    } catch (err) {
      console.warn("⚠️ Error en Supabase para getAllProfiles, usando solo LocalStorage:", err.message);
    }

    const cached = localStorage.getItem('connexo_team');
    if (cached) {
      const localTeam = JSON.parse(cached);
      
      // Purge zombies
      const updatedLocalTeam = localTeam.filter(l => {
         if (typeof l.id === 'string' && l.id.startsWith('profile-')) return true; // keep pure offline
         return supabaseData.some(su => su.id === l.id); // keep if still in cloud
      });
      if (updatedLocalTeam.length !== localTeam.length) localStorage.setItem('connexo_team', JSON.stringify(updatedLocalTeam));

      supabaseData = supabaseData.map(su => {
        const localMatch = localTeam.find(l => l.id === su.id || l.email === su.email);
        if (localMatch && !su.sede_asignada && localMatch.sede_asignada) {
          return { ...su, sede_asignada: localMatch.sede_asignada };
        }
        return su;
      });

      localTeam.forEach(localUser => {
        if (!supabaseData.some(su => su.id === localUser.id || su.email === localUser.email)) {
          supabaseData.push(localUser);
        }
      });
    }
    return supabaseData;
  },

  async updateProfile(userId, updates) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      _metricsCache.clear(); // ⚡ Invalidad cache de métricas en tiempo real
      return data;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para updateProfile:", err.message);
      const cached = localStorage.getItem('connexo_team') || '[]';
      let team = JSON.parse(cached);
      const idx = team.findIndex(t => t.id === userId || t.uid === userId);
      if (idx !== -1) {
        team[idx] = { ...team[idx], ...updates };
        localStorage.setItem('connexo_team', JSON.stringify(team));
        _metricsCache.clear();
        return team[idx];
      }
      throw new Error('Usuario no encontrado en caché local');
    }
  },

  // ─── GESTIÓN DE INVENTARIO (Real + LocalStorage Fallback) ──────────────────
  async getInventory(sedeContext = 'GLOBAL') {
    try {
      let query = supabase.from('inventory').select('*');
      if (sedeContext !== 'GLOBAL') {
        const expectedSedeId = sedeContext === 'Venezuela' ? 'sede-ve-1' : 'sede-ec-1';
        query = query.eq('sede_id', expectedSedeId);
      }
      const { data, error } = await query.order('name', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn("⚠️ No se pudo cargar inventario de Supabase, usando LocalStorage fallback:", err.message);
      const cached = localStorage.getItem('connexo_inventory');
      let items = cached ? JSON.parse(cached) : [];

      const needsMigration = items.length === 0 || items.some(i => !i.sede_id);
      if (needsMigration) {
        const defaultInventory = [
          // Ecuador Items
          { id: 'inv-ec-1', name: 'Tarjetas NFC (EC)', description: 'Tarjetas de presentación inteligente con tecnología NFC', category: 'NFC', stock_quantity: 500, unit_type: 'UNIDAD', detail_packaging: 'Cajas de 100 u.', sede_id: 'sede-ec-1' },
          { id: 'inv-ec-2', name: 'Pulseras NFC (EC)', description: 'Pulseras ajustables con chip NFC integrado', category: 'NFC', stock_quantity: 300, unit_type: 'UNIDAD', detail_packaging: 'Bolsas de 50 u.', sede_id: 'sede-ec-1' },
          { id: 'inv-ec-3', name: 'Chips NFC (EC)', description: 'Stickers / Chips NFC adhesivos pequeños', category: 'NFC', stock_quantity: 1000, unit_type: 'UNIDAD', detail_packaging: 'Empaques de 200 u.', sede_id: 'sede-ec-1' },
          { id: 'inv-ec-4', name: 'Cajas de Presentación (EC)', description: 'Cajas elegantes de empaque para productos NFC', category: 'PACKAGING', stock_quantity: 200, unit_type: 'UNIDAD', detail_packaging: 'Caja Kraft Premium', sede_id: 'sede-ec-1' },
          { id: 'inv-ec-5', name: 'Empaques Connexo (EC)', description: 'Empaques sellados con branding de Connexo', category: 'PACKAGING', stock_quantity: 400, unit_type: 'UNIDAD', detail_packaging: 'Sobres acolchados', sede_id: 'sede-ec-1' },

          // Venezuela Items
          { id: 'inv-ve-1', name: 'Tarjetas NFC (VE)', description: 'Tarjetas de presentación inteligente con tecnología NFC', category: 'NFC', stock_quantity: 150, unit_type: 'UNIDAD', detail_packaging: 'Cajas de 100 u.', sede_id: 'sede-ve-1' },
          { id: 'inv-ve-2', name: 'Pulseras NFC (VE)', description: 'Pulseras ajustables con chip NFC integrado', category: 'NFC', stock_quantity: 80, unit_type: 'UNIDAD', detail_packaging: 'Bolsas de 50 u.', sede_id: 'sede-ve-1' },
          { id: 'inv-ve-3', name: 'Chips NFC (VE)', description: 'Stickers / Chips NFC adhesivos pequeños', category: 'NFC', stock_quantity: 250, unit_type: 'UNIDAD', detail_packaging: 'Empaques de 200 u.', sede_id: 'sede-ve-1' },
          { id: 'inv-ve-4', name: 'Cajas de Presentación (VE)', description: 'Cajas elegantes de empaque para productos NFC', category: 'PACKAGING', stock_quantity: 50, unit_type: 'UNIDAD', detail_packaging: 'Caja Kraft Premium', sede_id: 'sede-ve-1' },
          { id: 'inv-ve-5', name: 'Empaques Connexo (VE)', description: 'Empaques sellados con branding de Connexo', category: 'PACKAGING', stock_quantity: 100, unit_type: 'UNIDAD', detail_packaging: 'Sobres acolchados', sede_id: 'sede-ve-1' }
        ];
        localStorage.setItem('connexo_inventory', JSON.stringify(defaultInventory));
        items = defaultInventory;
      }

      if (sedeContext !== 'GLOBAL') {
        const expectedSedeId = sedeContext === 'Venezuela' ? 'sede-ve-1' : 'sede-ec-1';
        return items.filter(i => i.sede_id === expectedSedeId);
      }
      return items;
    }
  },

  async addInventoryItem(itemData) {
    try {
      const newItem = {
        name: itemData.name,
        description: itemData.description || '',
        category: itemData.category || 'NFC',
        stock_quantity: Number(itemData.stock_quantity) || 0,
        unit_type: itemData.unit_type || 'UNIDAD',
        detail_packaging: itemData.detail_packaging || '',
        sede_id: itemData.sede_id || 'sede-ec-1'
      };

      const { data, error } = await supabase
        .from('inventory')
        .insert([newItem])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para agregar ítem:", err.message);
      const cached = localStorage.getItem('connexo_inventory') || '[]';
      const allItems = JSON.parse(cached);
      const newItem = {
        id: `inv-${Date.now()}`,
        name: itemData.name,
        description: itemData.description || '',
        category: itemData.category || 'NFC',
        stock_quantity: Number(itemData.stock_quantity) || 0,
        unit_type: itemData.unit_type || 'UNIDAD',
        detail_packaging: itemData.detail_packaging || '',
        sede_id: itemData.sede_id || 'sede-ec-1'
      };
      allItems.push(newItem);
      localStorage.setItem('connexo_inventory', JSON.stringify(allItems));
      return newItem;
    }
  },

  async editInventoryItem(itemId, updates) {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .update(updates)
        .eq('id', itemId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para editar ítem:", err.message);
      const items = await this.getInventory();
      const idx = items.findIndex(i => i.id === itemId);
      if (idx !== -1) {
        items[idx] = { ...items[idx], ...updates };
        localStorage.setItem('connexo_inventory', JSON.stringify(items));
        return items[idx];
      }
      throw new Error('Producto no encontrado en caché local');
    }
  },

  async deleteInventoryItem(itemId) {
    try {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', itemId);
      
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para eliminar ítem:", err.message);
      const items = await this.getInventory();
      const filtered = items.filter(i => i.id !== itemId);
      localStorage.setItem('connexo_inventory', JSON.stringify(filtered));
      return true;
    }
  },

  async updateInventoryStock(itemId, quantity, type = 'add') {
    try {
      const items = await this.getInventory();
      const item = items.find(i => i.id === itemId);
      if (!item) throw new Error('Producto no encontrado');

      let newStock = item.stock_quantity;
      if (type === 'add') newStock += Number(quantity);
      if (type === 'set') newStock = Number(quantity);
      if (type === 'sub') {
        if (newStock < quantity) throw new Error('Stock insuficiente');
        newStock -= Number(quantity);
      }

      const { data, error } = await supabase
        .from('inventory')
        .update({ stock_quantity: newStock })
        .eq('id', itemId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para actualizar stock:", err.message);
      const items = await this.getInventory();
      const idx = items.findIndex(i => i.id === itemId);
      if (idx !== -1) {
        let newStock = items[idx].stock_quantity;
        if (type === 'add') newStock += Number(quantity);
        if (type === 'set') newStock = Number(quantity);
        if (type === 'sub') {
          if (newStock < quantity) throw new Error('Stock insuficiente');
          newStock -= Number(quantity);
        }
        items[idx].stock_quantity = newStock;
        localStorage.setItem('connexo_inventory', JSON.stringify(items));
        return items[idx];
      }
      throw new Error('Producto no encontrado en caché local');
    }
  },

  async createInventoryRequest(distributorId, itemsList, notes = '') {
    try {
      const newRequest = {
        distributor_id: distributorId,
        items: itemsList, // Array de { product_id, quantity, product_name }
        status: 'PENDING',
        notes: notes
      };

      const { data, error } = await supabase
        .from('inventory_requests')
        .insert([newRequest])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para solicitar stock:", err.message);
      const requests = await this.getInventoryRequests();
      const newReq = {
        id: `req-${Date.now()}`,
        distributor_id: distributorId,
        items: itemsList,
        status: 'PENDING',
        notes: notes,
        created_at: new Date().toISOString()
      };
      requests.push(newReq);
      localStorage.setItem('connexo_inventory_requests', JSON.stringify(requests));
      return newReq;
    }
  },

  async getInventoryRequests(distributorId = null) {
    try {
      let query = supabase.from('inventory_requests').select('*');
      if (distributorId) {
        query = query.eq('distributor_id', distributorId);
      }
      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn("⚠️ Cargar solicitudes usando LocalStorage fallback:", err.message);
      const cached = localStorage.getItem('connexo_inventory_requests');
      const reqs = cached ? JSON.parse(cached) : [];
      if (distributorId) {
        return reqs.filter(r => r.distributor_id === distributorId);
      }
      return reqs;
    }
  },

  async updateRequestStatus(requestId, status) {
    try {
      const { data, error } = await supabase
        .from('inventory_requests')
        .update({ status })
        .eq('id', requestId)
        .select()
        .single();

      if (error) throw error;
      
      // Si se aprueba y actualizó bien en DB, descontar stock automáticamente
      if (status === 'APPROVED') {
        const requests = await this.getInventoryRequests();
        const req = requests.find(r => r.id === requestId);
        if (req && req.status !== 'APPROVED') {
          // Descontar cada ítem del stock
          for (const item of req.items) {
            await this.updateInventoryStock(item.product_id, item.quantity, 'sub');
          }
        }
      }
      return data;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para actualizar estado del pedido:", err.message);
      const requests = localStorage.getItem('connexo_inventory_requests');
      const reqs = requests ? JSON.parse(requests) : [];
      const idx = reqs.findIndex(r => r.id === requestId);
      if (idx !== -1) {
        if (status === 'APPROVED' && reqs[idx].status !== 'APPROVED') {
          for (const item of reqs[idx].items) {
            await this.updateInventoryStock(item.product_id, item.quantity, 'sub');
          }
        }
        reqs[idx].status = status;
        localStorage.setItem('connexo_inventory_requests', JSON.stringify(reqs));
        return reqs[idx];
      }
      throw new Error('Pedido no encontrado en caché local');
    }
  },

  async getAcademyCourses() {
    try {
      const { data, error } = await supabase.from('academy_courses').select('*');
      if (!error && data && data.length > 0) return data;
    } catch (e) {
      // Ignore
    }
    const cached = localStorage.getItem('connexo_academy_courses');
    if (cached) return JSON.parse(cached);
    
    // Default initial academy materials
    const defaultCourses = [
      {
        id: '1',
        title: "Fundamentos del Ecosistema",
        type: "video",
        url: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        duration: "15 min",
        description: "Aprende los principios básicos del funcionamiento del hardware NFC y la plataforma de Connexo."
      },
      {
        id: '2',
        title: "Técnicas de Cierre Efectivo",
        type: "document",
        url: "https://example.com/guia-ventas-connexo.pdf",
        duration: "25 min",
        description: "Guía maestra en PDF sobre objeciones de clientes y cómo colocar suscripciones recurrentes PRO y ULTRA."
      },
      {
        id: '3',
        title: "Examen de Certificación Oficial",
        type: "quiz",
        duration: "10 min",
        description: "Responde este cuestionario interactivo de 3 preguntas para obtener tu certificación oficial de comisiones.",
        questions: [
          {
            question: "¿Cuál es el beneficio principal de la cuenta ULTRA para un cliente?",
            options: [
              "No tiene ningún beneficio relevante",
              "Mayor comisión y herramientas avanzadas de bio con IA",
              "Solo un color de perfil diferente"
            ],
            answer: 1
          },
          {
            question: "¿Qué rol tiene asignado un distribuidor en la jerarquía de red de Connexo?",
            options: [
              "No puede tener vendedores a su cargo",
              "Vender directamente sin construir red",
              "Crear y expandir una red de vendedores ganando comisiones por volumen"
            ],
            answer: 2
          },
          {
            question: "¿Por qué es importante priorizar la venta de planes recurrentes?",
            options: [
              "Para asegurar ingresos constantes y retención de clientes SaaS",
              "No tiene importancia, solo importa el hardware",
              "Es obligatorio por ley"
            ],
            answer: 0
          }
        ]
      }
    ];
    localStorage.setItem('connexo_academy_courses', JSON.stringify(defaultCourses));
    return defaultCourses;
  },

  async saveAcademyCourses(courses) {
    try {
      await supabase.from('academy_courses').upsert(courses);
    } catch (e) {
      // Ignore
    }
    localStorage.setItem('connexo_academy_courses', JSON.stringify(courses));
  },

  async purgeAllData() {
    try {
      // Borrar todas las ventas
      await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      // Borrar todos los pedidos de inventario
      await supabase.from('inventory_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      // Borrar todos los usuarios (profiles) excepto los dos super admins principales
      await supabase.from('profiles').delete()
        .neq('email', 'emapmvisual@gmail.com')
        .neq('email', 'thony.karter@gmail.com');
    } catch (e) {
      console.warn("Supabase purge error:", e);
    }

    _metricsCache.clear(); // ⚡ Invalidad cache de métricas en tiempo real

    // Limpiar LocalStorage preservando la sesión del admin, avatars/insignias, el INVENTARIO/STOCK actual, las SEDES y el contexto de sede
    const keysToPreserve = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key === 'connexo_session' || 
        key === 'connexo_inventory' ||
        key === 'connexo_sedes' ||
        key === 'connexo_selected_sede_context' ||
        key.startsWith('connexo_avatar_') || 
        key.startsWith('connexo_badges_')
      )) {
        keysToPreserve[key] = localStorage.getItem(key);
      }
    }
    localStorage.clear();
    Object.keys(keysToPreserve).forEach(key => {
      localStorage.setItem(key, keysToPreserve[key]);
    });
    return true;
  },

  async seedTestData(parentId) {
    const firstNames = ['Carlos', 'Andres', 'Daniel', 'Santiago', 'Mateo', 'Sebastian', 'Alejandro', 'Gabriel', 'Nicolas', 'Samuel'];
    const lastNames = ['Gomez', 'Rodriguez', 'Perez', 'Sanchez', 'Martinez', 'Torres', 'Lopez', 'Diaz', 'Ramirez', 'Moreno'];

    const sellers = [];
    for (let i = 1; i <= 10; i++) {
      const name = `${firstNames[i-1]} ${lastNames[i-1]}`;
      const email = `vendedor.pro${i}@connexo.com`;
      sellers.push({
        full_name: name,
        email: email,
        password: 'connexo123',
        role: ROLES.SELLER,
        tier: 'PRO',
        tier_start_date: new Date().toISOString(),
        is_certified: true,
        wallet_balance: 0,
        parent_id: parentId || null
      });
    }

    // 1. Insertar los 10 perfiles en Supabase
    const { data: insertedSellers, error: sellerError } = await supabase
      .from('profiles')
      .insert(sellers)
      .select();

    if (sellerError) throw new Error("Error sembrando vendedores: " + sellerError.message);

    // 2. Generar 40 ventas mensuales de prueba (PRO o ULTRA) para cada vendedor
    const salesToInsert = [];
    const customerFirstNames = ['Maria', 'Ana', 'Laura', 'Isabella', 'Lucia', 'Sofia', 'Camila', 'Valentina', 'Victoria', 'Juliana'];
    const customerLastNames = ['Ruiz', 'Giraldo', 'Soto', 'Herrera', 'Castro', 'Vargas', 'Rios', 'Mendoza', 'Munoz', 'Ortega'];

    for (const seller of insertedSellers) {
      let totalSellerWallet = 0;
      for (let j = 1; j <= 40; j++) {
        const isProPlan = Math.random() > 0.4; // 60% PRO, 40% ULTRA
        const planKey = isProPlan ? 'PRO' : 'ULTRA';
        const basePrice = isProPlan ? 7.00 : 15.00; // Suscripción mensual
        const rate = 0.07; // Vendedor PRO rate = 7%
        const commission = basePrice * rate;
        totalSellerWallet += commission;

        const cName = `${customerFirstNames[Math.floor(Math.random() * 10)]} ${customerLastNames[Math.floor(Math.random() * 10)]}`;
        const day = Math.floor(Math.random() * 28) + 1;

        salesToInsert.push({
          seller_id: seller.id,
          plan_type: `${planKey} MENSUAL`,
          amount: basePrice,
          commission_earned: commission,
          customer_name: cName,
          customer_phone: `+593 9${Math.floor(Math.random() * 89999999 + 10000000)}`,
          customer_email: `${cName.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
          customer_company: j % 3 === 0 ? `Empresa ${j}` : null,
          customer_notes: `[COBRO MENSUAL: DÍA ${day} DE CADA MES] Sembrado de prueba.`,
          status: 'COMPLETED'
        });
      }

      // Actualizar billetera del vendedor con la suma acumulada de las comisiones
      await supabase
        .from('profiles')
        .update({ wallet_balance: totalSellerWallet })
        .eq('id', seller.id);
    }

    // Insertar todas las ventas juntas (batch insert)
    const { error: salesError } = await supabase
      .from('sales')
      .insert(salesToInsert);

    if (salesError) throw new Error("Error sembrando ventas: " + salesError.message);

    _metricsCache.clear();
    return true;
  },

  async seedTestDataAnnual(parentId) {
    const firstNames = ['Juan', 'Luis', 'Sandro', 'Roberto', 'Diego', 'Fernando', 'Ricardo', 'Alvaro', 'Oscar', 'Hugo'];
    const lastNames = ['Silva', 'Castro', 'Pinto', 'Vargas', 'Rios', 'Sosa', 'Mendoza', 'Peralta', 'Flores', 'Benitez'];

    const sellers = [];
    for (let i = 1; i <= 10; i++) {
      const name = `${firstNames[i-1]} ${lastNames[i-1]}`;
      const email = `vendedor.anual${i}@connexo.com`;
      sellers.push({
        full_name: name,
        email: email,
        password: 'connexo123',
        role: ROLES.SELLER,
        tier: 'PRO',
        tier_start_date: new Date().toISOString(),
        is_certified: true,
        wallet_balance: 0,
        parent_id: parentId || null
      });
    }

    // 1. Insertar los 10 perfiles en Supabase
    const { data: insertedSellers, error: sellerError } = await supabase
      .from('profiles')
      .insert(sellers)
      .select();

    if (sellerError) throw new Error("Error sembrando vendedores anuales: " + sellerError.message);

    // 2. Generar 40 ventas anuales de prueba (PRO o ULTRA) para cada vendedor
    const salesToInsert = [];
    const customerFirstNames = ['Elena', 'Patricia', 'Clara', 'Diana', 'Gabriela', 'Raquel', 'Teresa', 'Ines', 'Beatriz', 'Alicia'];
    const customerLastNames = ['Guzman', 'Navarro', 'Delgado', 'Acosta', 'Cabrera', 'Romero', 'Molina', 'Miranda', 'Suarez', 'Salazar'];

    for (const seller of insertedSellers) {
      let totalSellerWallet = 0;
      for (let j = 1; j <= 40; j++) {
        const isProPlan = Math.random() > 0.4; // 60% PRO, 40% ULTRA
        const planKey = isProPlan ? 'PRO' : 'ULTRA';
        const basePrice = isProPlan ? 97.00 : 179.00; // Suscripción anual
        const rate = 0.07; // Vendedor PRO rate = 7%
        const commission = basePrice * rate;
        totalSellerWallet += commission;

        const cName = `${customerFirstNames[Math.floor(Math.random() * 10)]} ${customerLastNames[Math.floor(Math.random() * 10)]}`;

        salesToInsert.push({
          seller_id: seller.id,
          plan_type: `${planKey} ANUAL`,
          amount: basePrice,
          commission_earned: commission,
          customer_name: cName,
          customer_phone: `+593 9${Math.floor(Math.random() * 89999999 + 10000000)}`,
          customer_email: `${cName.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
          customer_company: j % 3 === 0 ? `Empresa ${j}` : null,
          customer_notes: `Suscripción Anual. Sembrado de prueba.`,
          status: 'COMPLETED'
        });
      }

      // Actualizar billetera del vendedor con la suma acumulada de las comisiones
      await supabase
        .from('profiles')
        .update({ wallet_balance: totalSellerWallet })
        .eq('id', seller.id);
    }

    // Insertar todas las ventas juntas (batch insert)
    const { error: salesError } = await supabase
      .from('sales')
      .insert(salesToInsert);

    if (salesError) throw new Error("Error sembrando ventas anuales: " + salesError.message);

    _metricsCache.clear();
    return true;
  },

  // ─── GESTIÓN DE SEDES (Real + LocalStorage Fallback) ──────────────────
  async getSedes() {
    try {
      const { data, error } = await supabase
        .from('sedes')
        .select('*')
        .order('nombre_sede', { ascending: true });
      
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn("⚠️ No se pudo cargar sedes de Supabase, usando LocalStorage fallback:", err.message);
      const cached = localStorage.getItem('connexo_sedes');
      if (cached) return JSON.parse(cached);

      const defaultSedes = [
        { id: 'sede-ec-1', nombre_sede: 'Sede Quito', pais: 'Ecuador', created_at: new Date().toISOString() },
        { id: 'sede-ve-1', nombre_sede: 'Sede Caracas', pais: 'Venezuela', created_at: new Date().toISOString() }
      ];
      localStorage.setItem('connexo_sedes', JSON.stringify(defaultSedes));
      return defaultSedes;
    }
  },

  async addSede(sedeData) {
    try {
      const newSede = {
        nombre_sede: sedeData.nombre_sede,
        pais: sedeData.pais,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('sedes')
        .insert([newSede])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para agregar sede:", err.message);
      const sedes = await this.getSedes();
      const newSede = {
        id: `sede-${Date.now()}`,
        nombre_sede: sedeData.nombre_sede,
        pais: sedeData.pais,
        created_at: new Date().toISOString()
      };
      sedes.push(newSede);
      localStorage.setItem('connexo_sedes', JSON.stringify(sedes));
      return newSede;
    }
  },

  async editSede(sedeId, updates) {
    try {
      const { data, error } = await supabase
        .from('sedes')
        .update(updates)
        .eq('id', sedeId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para editar sede:", err.message);
      const sedes = await this.getSedes();
      const idx = sedes.findIndex(s => s.id === sedeId);
      if (idx !== -1) {
        sedes[idx] = { ...sedes[idx], ...updates };
        localStorage.setItem('connexo_sedes', JSON.stringify(sedes));
        return sedes[idx];
      }
      throw new Error('Sede no encontrada en caché local');
    }
  },

  async deleteSede(sedeId, userEmail) {
    const masterAdmin = import.meta.env.VITE_MASTER_ADMIN || 'thony.karter@gmail.com';
    if (userEmail !== masterAdmin) {
      throw new Error('Validación de Seguridad: Solo el Master Admin posee privilegios para eliminar sedes.');
    }
    try {
      const { error } = await supabase
        .from('sedes')
        .delete()
        .eq('id', sedeId);
      
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para eliminar sede:", err.message);
      const sedes = await this.getSedes();
      const filtered = sedes.filter(s => s.id !== sedeId);
      localStorage.setItem('connexo_sedes', JSON.stringify(filtered));
      return true;
    }
  },

  async registerSedeAdmin(adminData) {
    try {
      const newAdmin = {
        full_name: adminData.full_name,
        email: adminData.email,
        password: adminData.password,
        role: adminData.role || 'DISTRIBUTOR',
        is_certified: true,
        wallet_balance: 0,
        parent_id: null
      };

      const { data, error } = await supabase
        .from('profiles')
        .insert([newAdmin])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.warn("⚠️ Usando LocalStorage para registrar admin de sede:", err.message);
      const cachedTeam = localStorage.getItem('connexo_team') || '[]';
      const team = JSON.parse(cachedTeam);
      const newAdmin = {
        id: `profile-${Date.now()}`,
        full_name: adminData.full_name,
        email: adminData.email,
        password: adminData.password,
        role: adminData.role || 'DISTRIBUTOR',
        is_certified: true,
        wallet_balance: 0,
        sede_asignada: adminData.sede_asignada
      };
      team.push(newAdmin);
      localStorage.setItem('connexo_team', JSON.stringify(team));
      return newAdmin;
    }
  }
};
