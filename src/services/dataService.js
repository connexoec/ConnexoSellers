import { supabase } from '../lib/supabase';
import { DEFAULT_PROFILE_TYPE } from '../constants/customerProfiles';
import { safeSetItem } from '../lib/storage';

export const PLANS = {
  PRO:   { id: 'PRO',   price: 97.00,  label: 'Plan PRO' },
  ULTRA: { id: 'ULTRA', price: 197.00, label: 'Plan ULTRA' },
  CONNECTA: { id: 'CONNECTA', price: 0.00, label: 'Plan Connecta' }
};

// Columnas para los LISTADOS de perfiles (equipo / todos).
// Se excluye `avatar_url` a propósito: una foto en base64 pesa decenas de KB
// (y las viejas, megabytes) y ningún listado la usa, así que traerla multiplica
// el peso de cada carga. Para el perfil individual sí se pide con select('*').
// `password` tampoco se expone en listados (getTeam ya lo descartaba).
const PROFILE_LIST_COLUMNS =
  'id, created_at, full_name, email, role, tier, tier_start_date, is_certified, ' +
  'wallet_balance, parent_id, sede_asignada, badges';

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  DISTRIBUTOR: 'DISTRIBUTOR',
  SELLER:      'SELLER'
};

export const TIERS = {
  SELLER: [
    { id: 'PRO',   label: 'VENDEDOR PRO',   rate: 0.07, base: 250 },
    { id: 'ULTRA', label: 'VENDEDOR ULTRA', rate: 0.09, base: 350 },
  ],
  DISTRIBUTOR: [
    { id: 'D1',    label: 'DISTRIBUIDOR 1',     rate: 0.12, base: 500 },
    { id: 'D2',    label: 'DISTRIBUIDOR 2',     rate: 0.15, base: 700 },
    { id: 'D3',    label: 'DISTRIBUIDOR 3',     rate: 0.18, base: 850 },
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

  const cache = (data) => {
    // NUEVA REGLA: Mapeo dinámico de umbral de ventas anuales del mes según nivel
    let goal = 8; // Default base
    const lvl = (data.level || '').toUpperCase();

    if (lvl.includes('ULTRA')) {
      goal = 13;
    } else if (lvl.includes('DISTRIBUIDOR 1')) {
      goal = 25;
    } else if (lvl.includes('DISTRIBUIDOR 2')) {
      goal = 50;
    } else if (lvl.includes('DISTRIBUIDOR 3')) {
      goal = 75;
    } else if (lvl.includes('PRO')) {
      goal = 8;
    }

    if (data.level !== 'BLOQUEADO') {
      data.annualSalesGoal = goal;
      // Evaluar dinámicamente el desbloqueo según la meta asignada
      data.baseUnlocked = (data.annualSalesCount || 0) >= goal;
    }

    _metricsCache.set(cacheKey, { data, ts: Date.now() });
    return data;
  };

  if (!user.is_certified) return cache({ rate: 0, base: 0, level: 'BLOQUEADO', annualSalesCount: 0, baseUnlocked: false });

  // Fecha de inicio del conteo del NIVEL: el mes calendario en curso.
  // El conteo se REINICIA el día 1 de cada mes. Si el admin asignó categoría
  // dentro de este mismo mes, se cuenta desde esa fecha (tier_start_date).
  const startDate = (() => {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const asignacion = user.tier_start_date ? new Date(user.tier_start_date) : null;
    return (asignacion && asignacion > inicioMes ? asignacion : inicioMes).toISOString();
  })();

  // Helper para contar ventas del mes en curso
  const countSales = (query) => query.gte('created_at', startDate);

  let annualSalesCount = 0;

  // Helper para contar ventas anuales específicamente (SOLO DEL MES ACTUAL)
  const countAnnualSales = async (ids) => {
    try {
      const now = new Date();
      // Capturar inicio del mes calendario actual
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { count } = await supabase.from('sales')
          .select('*', { count: 'exact', head: true })
          .in('seller_id', ids)
          .ilike('plan_type', '%ANUAL%')
          .gte('created_at', startOfMonth); // <-- NUEVA REGLA: Al mes
      return count || 0;
    } catch (e) {
      return 0;
    }
  };

  // Priorizar nivel manual si existe — pero seguir contando desde tier_start_date
  // para saber cuándo debe subir al siguiente nivel
  if (user.tier) {
    const roleTiers = user.role === ROLES.SELLER ? TIERS.SELLER : TIERS.DISTRIBUTOR;
    const manualTier = roleTiers.find(t => t.id === user.tier);
    if (manualTier) {
      let total = 0;
      let currentAnnual = 0;

      // Contar ventas desde la asignación para detectar si ya subió de nivel
      if (user.role === ROLES.SELLER) {
        try {
          const { count: salesSinceAssignment } = await countSales(
            supabase.from('sales').select('*', { count: 'exact', head: true }).eq('seller_id', uid)
          );
          total = salesSinceAssignment || 0;
          currentAnnual = await countAnnualSales([uid]);
        } catch (e) {
          console.warn("calcMetrics fallback for manual SELLER:", e.message);
        }
        // Si ya superó los umbrales del siguiente nivel, subir automáticamente
        if (total >= 50) return cache({ rate: 0.09, base: 350, level: 'VENDEDOR ULTRA', salesCount: total, annualSalesCount: currentAnnual, baseUnlocked: currentAnnual >= 13 });
        if (total >= 31) return cache({ rate: 0.07, base: 250, level: 'VENDEDOR PRO',   salesCount: total, annualSalesCount: currentAnnual, baseUnlocked: currentAnnual >= 8 });
      } else if (user.role === ROLES.DISTRIBUTOR) {
         try {
            const { data: team } = await supabase.from('profiles').select('id').eq('parent_id', uid);
            const teamIds = [uid, ...(team?.map(t => t.id) || [])];
            currentAnnual = await countAnnualSales(teamIds);
         } catch(e) {}
      }
      return cache({ rate: manualTier.rate, base: manualTier.base, level: manualTier.label, salesCount: 0, annualSalesCount: currentAnnual });
    }
  }

  // ─── VENDEDOR (Auto) ──────────────────────────────────────────────────
  if (user.role === ROLES.SELLER) {
    let total = 0;
    let currentAnnual = 0;
    try {
      const { count: mySales } = await countSales(
        supabase.from('sales').select('*', { count: 'exact', head: true }).eq('seller_id', uid)
      );
      total = mySales || 0;
      currentAnnual = await countAnnualSales([uid]);
    } catch (e) {
      console.warn("calcMetrics fallback for SELLER:", e.message);
    }
    // cache() recalcula baseUnlocked dinámicamente según el nivel
    if (total >= 50) return cache({ rate: 0.09, base: 350, level: 'VENDEDOR ULTRA', salesCount: total, annualSalesCount: currentAnnual });
    return cache({ rate: 0.07, base: 250, level: 'VENDEDOR PRO', salesCount: total, annualSalesCount: currentAnnual });
  }

  // ─── DISTRIBUIDOR (Auto) ──────────────────────────────────────────────
  if (user.role === ROLES.DISTRIBUTOR) {
    let total = 0;
    let currentAnnual = 0;
    try {
      const { data: team } = await supabase.from('profiles').select('id').eq('parent_id', uid);
      const teamIds = [uid, ...(team?.map(t => t.id) || [])];

      const { count: teamSales } = await countSales(
        supabase.from('sales').select('*', { count: 'exact', head: true }).in('seller_id', teamIds)
      );
      total = teamSales || 0;
      currentAnnual = await countAnnualSales(teamIds);
    } catch (e) {
      console.warn("calcMetrics fallback for DISTRIBUTOR:", e.message);
    }
    // cache() recalcula baseUnlocked dinámicamente según el nivel
    if (total >= 300) return cache({ rate: 0.18, base: 850, level: 'DISTRIBUIDOR 3', salesCount: total, annualSalesCount: currentAnnual });
    if (total >= 200) return cache({ rate: 0.15, base: 700, level: 'DISTRIBUIDOR 2', salesCount: total, annualSalesCount: currentAnnual });
    return cache({ rate: 0.12, base: 500, level: 'DISTRIBUIDOR 1', salesCount: total, annualSalesCount: currentAnnual });
  }

  return cache({ rate: 0, base: 0, level: 'SUPER ADMIN', annualSalesCount: 0, baseUnlocked: true });
}

export const dataService = {
  async login(email, password, selectedRole = null) {
    // 1. Validación de Super Admins Principales
    const hardcodedAdmins = {
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
        if (error && error.code === 'PGRST116') {
          throw new Error('USER_NOT_FOUND');
        }
        throw new Error('No encontrado en Supabase');
      }
    } catch (err) {
      if (err.message === 'USER_NOT_FOUND') {
        throw new Error('Credenciales incorrectas o cuenta no registrada.');
      }
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
    safeSetItem(`connexo_badges_${userId}`, JSON.stringify(badges));
  },

  async registerSale(userId, planKey, customerData, currentRate, isCertified, billingCycle = 'annually', sedeId = null) {
    const isMonthly = billingCycle === 'monthly';
    let basePrice = 0;
    if (planKey === 'PRO') {
      basePrice = isMonthly ? 9.00 : 97.00;
    } else if (planKey === 'ULTRA') {
      basePrice = isMonthly ? 17.00 : 197.00;
    } else if (planKey === 'CONNECTA') {
      basePrice = 0.00;
    }

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

    const commission = planKey === 'CONNECTA' ? 0 : (isCertified && realRate > 0 ? basePrice * realRate : 0);

    const currentDate = new Date();
    const monthlyBillingDateNote = `[COBRO MENSUAL: DÍA ${currentDate.getDate()} DE CADA MES]`;
    const trialNote = `[PRUEBA GRATUITA: 7 DÍAS]`;
    
    let notes = customerData.notes || null;
    if (planKey === 'CONNECTA') {
      notes = customerData.notes ? `${trialNote} ${customerData.notes}` : trialNote;
    } else if (isMonthly) {
      notes = customerData.notes ? `${monthlyBillingDateNote} ${customerData.notes}` : monthlyBillingDateNote;
    }

    const newSale = {
      seller_id: userId,
      plan_type: planKey === 'CONNECTA' ? 'CONNECTA 7 DIAS' : `${planKey} ${isMonthly ? 'MENSUAL' : 'ANUAL'}`,
      amount: basePrice,
      commission_earned: commission,
      customer_name: customerData.name,
      customer_phone: customerData.phone,
      customer_email: customerData.email || null,
      customer_company: customerData.company || null,
      customer_notes: notes,
      status: 'COMPLETED',
      sede_id: sedeId || 'sede-ec-1', // Auto-Etiquetado con contexto activo
      profile_type: customerData.profileType || DEFAULT_PROFILE_TYPE
    };

    try {
      let { data: sale, error } = await supabase
        .from('sales')
        .insert([newSale])
        .select()
        .single();

      // Compatibilidad: si la columna profile_type todavía no existe en la base
      // (migración pendiente), reintentar sin ella para no perder la venta.
      if (error && /profile_type/i.test(error.message || '')) {
        console.warn("⚠️ Columna 'profile_type' ausente en Supabase — reintentando sin ella. Ejecuta supabase/schema.sql.");
        const { profile_type, ...saleWithoutProfile } = newSale;
        ({ data: sale, error } = await supabase
          .from('sales')
          .insert([saleWithoutProfile])
          .select()
          .single());
      }

      if (error) throw new Error(error.message);

      const completeSale = { ...newSale, ...sale };
      const cached = localStorage.getItem('connexo_sales') || '[]';
      const sales = JSON.parse(cached);
      if (!sales.some(s => s.id === completeSale.id)) {
        sales.push(completeSale);
        safeSetItem('connexo_sales', JSON.stringify(sales));
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
           safeSetItem('connexo_team', JSON.stringify(team));
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
      safeSetItem('connexo_sales', JSON.stringify(sales));
      
      if (commission > 0) {
        if (_currentUser && _currentUser.id === userId) {
          _currentUser.wallet_balance = Number(_currentUser.wallet_balance || 0) + commission;
        }
        const cachedTeam = localStorage.getItem('connexo_team') || '[]';
        let team = JSON.parse(cachedTeam);
        const idx = team.findIndex(t => t.id === userId);
        if (idx !== -1) {
          team[idx].wallet_balance = Number(team[idx].wallet_balance || 0) + commission;
          safeSetItem('connexo_team', JSON.stringify(team));
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

      // PostgREST devuelve como máximo 1000 filas por request: hay que paginar
      // o el historial de meses viejos aparece incompleto (ver Lección #7).
      const PAGE = 1000;
      for (let desde = 0; ; desde += PAGE) {
        let query = supabase.from('sales').select('*')
          .order('created_at', { ascending: false })
          .range(desde, desde + PAGE - 1);
        if (role !== ROLES.SUPER_ADMIN) {
          query = query.in('seller_id', teamIds);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        supabaseData.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
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

  async updateSale(saleId, updates) {
    try {
      const { data, error } = await supabase
        .from('sales')
        .update(updates)
        .eq('id', saleId)
        .select()
        .single();

      if (error) throw error;

      const cached = localStorage.getItem('connexo_sales');
      if (cached) {
        const sales = JSON.parse(cached);
        const idx = sales.findIndex(s => s.id === saleId);
        if (idx !== -1) {
           sales[idx] = { ...sales[idx], ...updates };
           safeSetItem('connexo_sales', JSON.stringify(sales));
        }
      }
      return data;
    } catch (err) {
       console.warn("⚠️ Error actualizando venta, usando LocalStorage fallback:", err.message);
       const cached = localStorage.getItem('connexo_sales');
       if (cached) {
          const sales = JSON.parse(cached);
          const idx = sales.findIndex(s => s.id === saleId);
          if (idx !== -1) {
             sales[idx] = { ...sales[idx], ...updates };
             safeSetItem('connexo_sales', JSON.stringify(sales));
             return sales[idx];
          }
       }
       throw err;
    }
  },

  async deleteSale(saleId, userId) {
    try {
      // 1. Obtener la venta para saber la comisión y monto reversado
      const { data: sale } = await supabase.from('sales').select('*').eq('id', saleId).single();
      if (!sale) throw new Error("Venta no encontrada");
      
      const commToRevert = Number(sale.commission_earned || 0);

      // 2. Borrar la venta física
      const { error } = await supabase.from('sales').delete().eq('id', saleId);
      if (error) throw error;

      // 3. Revertir balance de billetera del vendedor si hay comisión
      if (commToRevert > 0) {
         const { data: profile } = await supabase.from('profiles').select('wallet_balance').eq('id', userId).single();
         if (profile) {
            const newBalance = Math.max(0, Number(profile.wallet_balance || 0) - commToRevert);
            await supabase.from('profiles').update({ wallet_balance: newBalance }).eq('id', userId);
            if (_currentUser && _currentUser.id === userId) {
               _currentUser.wallet_balance = newBalance;
            }
         }
      }

      // Limpiar cache local
      const cached = localStorage.getItem('connexo_sales');
      if (cached) {
         const sales = JSON.parse(cached).filter(s => s.id !== saleId);
         safeSetItem('connexo_sales', JSON.stringify(sales));
      }
      
      _metricsCache.clear();
      return true;
    } catch (err) {
       console.warn("⚠️ Error borrando venta, intentando LocalStorage fallback:", err.message);
       const cached = localStorage.getItem('connexo_sales');
       if (cached) {
          const sales = JSON.parse(cached);
          const filtered = sales.filter(s => s.id !== saleId);
          safeSetItem('connexo_sales', JSON.stringify(filtered));
          _metricsCache.clear();
          return true;
       }
       throw err;
    }
  },

  async getTeam(parentId) {
    let supabaseData = [];
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_LIST_COLUMNS)
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
      if (updatedLocalTeam.length !== allLocalTeam.length) safeSetItem('connexo_team', JSON.stringify(updatedLocalTeam));

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
    let calculatedSede = userData.sede_asignada || null;
    
    // Si no viene sede asignada, intentamos obtenerla del padre
    if (!calculatedSede && parentId) {
      try {
        const { data: parentProfile } = await supabase
          .from('profiles')
          .select('sede_asignada')
          .eq('id', parentId)
          .single();
        if (parentProfile?.sede_asignada && parentProfile.sede_asignada !== 'GLOBAL' && parentProfile.sede_asignada !== 'null') {
          calculatedSede = parentProfile.sede_asignada;
        }
      } catch (err) {
        console.warn("Error fetching parent profile for sede fallback:", err);
      }
    }

    // Si aún no hay sede asignada, usamos el fallback de email (ve -> Venezuela, si no Ecuador)
    if (!calculatedSede) {
      const emailVal = userData.email || '';
      calculatedSede = emailVal.toLowerCase().includes('ve') ? 'sede-ve-1' : 'sede-ec-1';
    }

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
      sede_asignada: calculatedSede
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
        safeSetItem('connexo_team', JSON.stringify(team));
      }
      return completeProfile;
    } catch (err) {
      // Si el error NO es de red (ej: duplicado), abortamos y lo mostramos al usuario
      if (err.message && !err.message.toLowerCase().includes('fetch')) {
        console.error("⚠️ Error de Supabase al agregar usuario:", err.message);
        throw new Error("No se pudo registrar: " + err.message);
      }
      
      console.warn("⚠️ Usando LocalStorage para agregar miembro de equipo:", err.message);
      const cached = localStorage.getItem('connexo_team') || '[]';
      const team = JSON.parse(cached);
      
      const newLocalProfile = {
        ...newProfile,
        id: `profile-${Date.now()}`
      };
      
      if (team.some(t => t.email === newLocalProfile.email)) {
        throw new Error('Ya existe un usuario con este correo (Offline).');
      }
      
      team.push(newLocalProfile);
      safeSetItem('connexo_team', JSON.stringify(team));
      
      const { password, ...safeProfile } = newLocalProfile;
      return safeProfile;
    }
  },

  async deleteTeamMember(userId) {
    try {
      // 1. Borrar dependencias directas para evitar Foreign Key constraints
      await supabase.from('sales').delete().eq('seller_id', userId);
      await supabase.from('inventory_requests').delete().eq('distributor_id', userId);

      // 2. Obtener y borrar en cascada a sus vendedores dependientes y sus ventas
      const { data: dependents } = await supabase.from('profiles').select('id').eq('parent_id', userId);
      if (dependents && dependents.length > 0) {
        for (const dep of dependents) {
           await supabase.from('sales').delete().eq('seller_id', dep.id);
           await supabase.from('inventory_requests').delete().eq('distributor_id', dep.id);
           await supabase.from('profiles').delete().eq('id', dep.id);
        }
      }

      // 3. Borrar el perfil del usuario objetivo
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);
      
      if (error) throw new Error(error.message);
      
      const cached = localStorage.getItem('connexo_team');
      if (cached) {
        let team = JSON.parse(cached);
        team = team.filter(t => t.id !== userId && t.parent_id !== userId);
        safeSetItem('connexo_team', JSON.stringify(team));
      }
      return true;
    } catch (err) {
      console.warn("⚠️ Error en Supabase al eliminar:", err.message);
      throw new Error("No se pudo eliminar el usuario en la base de datos: " + err.message);
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
        safeSetItem('connexo_team', JSON.stringify(team));
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
        .select(PROFILE_LIST_COLUMNS)
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
      if (updatedLocalTeam.length !== localTeam.length) safeSetItem('connexo_team', JSON.stringify(updatedLocalTeam));

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
      if (error) {
        // Un error de DATOS (correo duplicado, columna inexistente…) no se
        // arregla escribiendo en la caché local: hay que reportarlo tal cual
        // para que se pueda corregir. Al fallback solo se cae si falla la RED.
        const fallo = new Error(
          error.code === '23505'
            ? 'Ese correo ya está registrado por otro usuario.'
            : error.message
        );
        fallo.esDeDatos = true;
        throw fallo;
      }
      _metricsCache.clear(); // ⚡ Invalidad cache de métricas en tiempo real
      return data;
    } catch (err) {
      if (err.esDeDatos) throw err;
      console.warn("⚠️ Usando LocalStorage para updateProfile:", err.message);
      const cached = localStorage.getItem('connexo_team') || '[]';
      let team = JSON.parse(cached);
      const idx = team.findIndex(t => t.id === userId || t.uid === userId);
      if (idx !== -1) {
        team[idx] = { ...team[idx], ...updates };
        safeSetItem('connexo_team', JSON.stringify(team));
        _metricsCache.clear();
        return team[idx];
      }
      // Uno edita su PROPIO perfil sin estar en la caché de equipo (un vendedor
      // nunca se cachea a sí mismo): el cambio vale igual, lo persiste la sesión.
      _metricsCache.clear();
      return { id: userId, ...updates };
    }
  },

  // ─── NOTIFICACIONES ────────────────────────────────────────────────────────
  // Toda escritura aquí acaba disparando el webhook de Supabase → sendPush, así
  // que da igual si la notificación la crea un trigger de la base o la app.
  //
  // ⚠️ Degradan en silencio: mientras no se haya ejecutado
  // `supabase/migrations/20260806120000_setup_notifications.sql`, las tablas no
  // existen y estas funciones devuelven vacío en vez de romper la app.

  async getNotifications(userId, limit = 40) {
    if (!userId) return [];
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('⚠️ No se pudieron leer las notificaciones:', err.message);
      return [];
    }
  },

  /** Crea una notificación. `dedupeKey` evita repetir el mismo aviso. */
  async notify(userId, { type, title, body = null, url = null, data = {}, dedupeKey = null }) {
    if (!userId || !title) return null;
    try {
      if (dedupeKey) {
        const { data: previa } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', userId)
          .eq('data->>dedupeKey', dedupeKey)
          .limit(1);
        if (previa && previa.length) return null; // ya se avisó
      }
      const fila = {
        user_id: userId,
        type,
        title,
        body,
        url,
        data: dedupeKey ? { ...data, dedupeKey } : data
      };
      const { data: creada, error } = await supabase
        .from('notifications')
        .insert([fila])
        .select()
        .single();
      if (error) throw error;
      return creada;
    } catch (err) {
      console.warn('⚠️ No se pudo crear la notificación:', err.message);
      return null;
    }
  },

  /** Igual que notify, pero a todos los super admins. */
  async notifySuperAdmins(payload, exceptUserId = null) {
    try {
      const { data: admins, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', ROLES.SUPER_ADMIN);
      if (error) throw error;
      const destinos = (admins || []).filter(a => a.id !== exceptUserId);
      await Promise.all(destinos.map(a => this.notify(a.id, payload)));
      return destinos.length;
    } catch (err) {
      console.warn('⚠️ No se pudo notificar a los super admins:', err.message);
      return 0;
    }
  },

  async markNotificationsRead(userId) {
    if (!userId) return;
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);
    } catch (err) {
      console.warn('⚠️ No se pudieron marcar como leídas:', err.message);
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

      const needsMigration = items.length === 0 || items.some(i => !i.sede_id || i.price === undefined || i.name.includes('Tarjetas NFC (')) || !items.some(it => it.category === 'PLAN');
      if (needsMigration) {
        const defaultInventory = [
          // Ecuador Items (sede-ec-1)
          { id: 'inv-ec-plan', name: 'Licencia de Plan Connexo (EC)', description: 'Licencia para activación del ecosistema de plan inteligente Connexo.', category: 'PLAN', stock_quantity: 5000, unit_type: 'LICENCIA', detail_packaging: 'Distribución Digital', price: 5.26, sede_id: 'sede-ec-1' },
          { id: 'inv-ec-nfc-negra', name: 'Tarjeta NFC Negra (EC)', description: 'Tarjeta inteligente de presentación premium negra con tecnología NFC.', category: 'NFC', stock_quantity: 500, unit_type: 'UNIDAD', detail_packaging: 'Empaque individual', price: 0.45, sede_id: 'sede-ec-1' },
          { id: 'inv-ec-nfc-blanca', name: 'Tarjeta NFC Blanca (EC)', description: 'Tarjeta inteligente de presentación estándar blanca con tecnología NFC.', category: 'NFC', stock_quantity: 500, unit_type: 'UNIDAD', detail_packaging: 'Empaque individual', price: 0.45, sede_id: 'sede-ec-1' },
          { id: 'inv-ec-pulsera', name: 'Pulsera NFC (EC)', description: 'Pulsera ergonómica y ajustable con chip NFC integrado.', category: 'NFC', stock_quantity: 300, unit_type: 'UNIDAD', detail_packaging: 'Bolsas protectoras', price: 5.50, sede_id: 'sede-ec-1' },
          { id: 'inv-ec-lector', name: 'Lector NFC (EC)', description: 'Lector/Grabador de mesa NFC para sincronización masiva.', category: 'NFC', stock_quantity: 50, unit_type: 'UNIDAD', detail_packaging: 'Caja sellada con cable USB', price: 80.00, sede_id: 'sede-ec-1' },
          { id: 'inv-ec-chips', name: 'Chips NFC (Paquete 100u) (EC)', description: 'Paquete de microchips NFC autoadhesivos pequeños.', category: 'NFC', stock_quantity: 1000, unit_type: 'UNIDAD', detail_packaging: 'Rollo sellado de 100 chips', price: 40.00, sede_id: 'sede-ec-1' },
          { id: 'inv-ec-caja', name: 'Caja / Empaque (EC)', description: 'Caja de presentación Kraft Premium para productos Connexo.', category: 'PACKAGING', stock_quantity: 200, unit_type: 'UNIDAD', detail_packaging: 'Caja rígida premium', price: 3.00, sede_id: 'sede-ec-1' },
          { id: 'inv-ec-impresion', name: 'Servicio de Impresión (EC)', description: 'Personalización y grabado de imagen corporativa sobre tarjeta NFC.', category: 'MERCH', stock_quantity: 400, unit_type: 'UNIDAD', detail_packaging: 'Acabado mate/brillante', price: 4.00, sede_id: 'sede-ec-1' },

          // Venezuela Items (sede-ve-1)
          { id: 'inv-ve-plan', name: 'Licencia de Plan Connexo (VE)', description: 'Licencia para activación del ecosistema de plan inteligente Connexo.', category: 'PLAN', stock_quantity: 2000, unit_type: 'LICENCIA', detail_packaging: 'Distribución Digital', price: 5.26, sede_id: 'sede-ve-1' },
          { id: 'inv-ve-nfc-negra', name: 'Tarjeta NFC Negra (VE)', description: 'Tarjeta inteligente de presentación premium negra con tecnología NFC.', category: 'NFC', stock_quantity: 150, unit_type: 'UNIDAD', detail_packaging: 'Empaque individual', price: 0.45, sede_id: 'sede-ve-1' },
          { id: 'inv-ve-nfc-blanca', name: 'Tarjeta NFC Blanca (VE)', description: 'Tarjeta inteligente de presentación estándar blanca con tecnología NFC.', category: 'NFC', stock_quantity: 150, unit_type: 'UNIDAD', detail_packaging: 'Empaque individual', price: 0.45, sede_id: 'sede-ve-1' },
          { id: 'inv-ve-pulsera', name: 'Pulsera NFC (VE)', description: 'Pulsera ergonómica y ajustable con chip NFC integrado.', category: 'NFC', stock_quantity: 80, unit_type: 'UNIDAD', detail_packaging: 'Bolsas protectoras', price: 5.50, sede_id: 'sede-ve-1' },
          { id: 'inv-ve-lector', name: 'Lector NFC (VE)', description: 'Lector/Grabador de mesa NFC para sincronización masiva.', category: 'NFC', stock_quantity: 20, unit_type: 'UNIDAD', detail_packaging: 'Caja sellada con cable USB', price: 80.00, sede_id: 'sede-ve-1' },
          { id: 'inv-ve-chips', name: 'Chips NFC (Paquete 100u) (VE)', description: 'Paquete de microchips NFC autoadhesivos pequeños.', category: 'NFC', stock_quantity: 250, unit_type: 'UNIDAD', detail_packaging: 'Rollo sellado de 100 chips', price: 40.00, sede_id: 'sede-ve-1' },
          { id: 'inv-ve-caja', name: 'Caja / Empaque (VE)', description: 'Caja de presentación Kraft Premium para productos Connexo.', category: 'PACKAGING', stock_quantity: 50, unit_type: 'UNIDAD', detail_packaging: 'Caja rígida premium', price: 3.00, sede_id: 'sede-ve-1' },
          { id: 'inv-ve-impresion', name: 'Servicio de Impresión (VE)', description: 'Personalización y grabado de imagen corporativa sobre tarjeta NFC.', category: 'MERCH', stock_quantity: 100, unit_type: 'UNIDAD', detail_packaging: 'Acabado mate/brillante', price: 4.00, sede_id: 'sede-ve-1' }
        ];
        safeSetItem('connexo_inventory', JSON.stringify(defaultInventory));
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
        price: Number(itemData.price) || 0,
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
        price: Number(itemData.price) || 0,
        sede_id: itemData.sede_id || 'sede-ec-1'
      };
      allItems.push(newItem);
      safeSetItem('connexo_inventory', JSON.stringify(allItems));
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
        safeSetItem('connexo_inventory', JSON.stringify(items));
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
      safeSetItem('connexo_inventory', JSON.stringify(filtered));
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
        safeSetItem('connexo_inventory', JSON.stringify(items));
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
      // Leer el estado PREVIO antes de actualizar: si se consulta después, el
      // pedido ya figura APPROVED y el descuento de stock jamás se ejecuta
      const { data: prevReq } = await supabase
        .from('inventory_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      const { data, error } = await supabase
        .from('inventory_requests')
        .update({ status })
        .eq('id', requestId)
        .select()
        .single();

      if (error) throw error;

      // Si se aprueba y actualizó bien en DB, descontar stock automáticamente
      // (solo si NO estaba ya aprobado, para no descontar dos veces)
      if (status === 'APPROVED' && prevReq && prevReq.status !== 'APPROVED' && Array.isArray(prevReq.items)) {
        for (const item of prevReq.items) {
          await this.updateInventoryStock(item.product_id, item.quantity, 'sub');
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
      // Borrar todos los usuarios (profiles) excepto el super admin principal
      await supabase.from('profiles').delete()
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
    const customerFirstNames = ['Maria', 'Ana', 'Laura', 'Isabella', 'Lucia', 'Sofia', 'Camila', 'Valentina', 'Victoria', 'Juliana'];
    const customerLastNames = ['Ruiz', 'Giraldo', 'Soto', 'Herrera', 'Castro', 'Vargas', 'Rios', 'Mendoza', 'Munoz', 'Ortega'];

    for (const seller of insertedSellers) {
      const salesToInsert = [];
      let totalSellerWallet = 0;
      for (let j = 1; j <= 40; j++) {
        const isProPlan = Math.random() > 0.4; // 60% PRO, 40% ULTRA
        const planKey = isProPlan ? 'PRO' : 'ULTRA';
        const basePrice = isProPlan ? 9.00 : 17.00; // Suscripción mensual
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

      // Insertar las ventas de ESTE vendedor de inmediato (no en bulk al final):
      // si el proceso se interrumpe, los vendedores ya creados conservan sus ventas
      const { error: salesError } = await supabase
        .from('sales')
        .insert(salesToInsert);

      if (salesError) throw new Error("Error sembrando ventas: " + salesError.message);

      // Actualizar billetera del vendedor con la suma acumulada de las comisiones
      await supabase
        .from('profiles')
        .update({ wallet_balance: totalSellerWallet })
        .eq('id', seller.id);
    }

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
    const customerFirstNames = ['Elena', 'Patricia', 'Clara', 'Diana', 'Gabriela', 'Raquel', 'Teresa', 'Ines', 'Beatriz', 'Alicia'];
    const customerLastNames = ['Guzman', 'Navarro', 'Delgado', 'Acosta', 'Cabrera', 'Romero', 'Molina', 'Miranda', 'Suarez', 'Salazar'];

    for (const seller of insertedSellers) {
      const salesToInsert = [];
      let totalSellerWallet = 0;
      for (let j = 1; j <= 40; j++) {
        const isProPlan = Math.random() > 0.4; // 60% PRO, 40% ULTRA
        const planKey = isProPlan ? 'PRO' : 'ULTRA';
        const basePrice = isProPlan ? 97.00 : 197.00; // Suscripción anual
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

      // Insertar las ventas de ESTE vendedor de inmediato (no en bulk al final):
      // si el proceso se interrumpe, los vendedores ya creados conservan sus ventas
      const { error: salesError } = await supabase
        .from('sales')
        .insert(salesToInsert);

      if (salesError) throw new Error("Error sembrando ventas anuales: " + salesError.message);

      // Actualizar billetera del vendedor con la suma acumulada de las comisiones
      await supabase
        .from('profiles')
        .update({ wallet_balance: totalSellerWallet })
        .eq('id', seller.id);
    }

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

  async seedCompleteScenario(adminId) {
    // ─────────────────────────────────────────────────────────────────────────
    // LIMPIEZA AUTOMÁTICA
    // Purga de todos los datos anteriores para evitar conflictos (constraints)
    // ─────────────────────────────────────────────────────────────────────────
    await this.purgeAllData();

    const now = new Date();
    const thisMonthISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // monthOffset: 0 = mes en curso, 1 = mes pasado, 2 = hace dos meses.
    // Permite que el Super Admin revise el historial mes a mes.
    const makeSale = (sellerId, planKey, isAnnual = true, sedeId = 'sede-ec-1', monthOffset = 0) => {
      const annual = isAnnual;
      const basePrice = planKey === 'PRO' ? (annual ? 97.00 : 9.00) : (annual ? 197.00 : 17.00);
      const rate = 0.07;
      const names = ['Sofia Ruiz','Elena Castro','Maria Silva','Laura Gomez','Ana Torres','Lucia Diaz','Camila Rios','Valeria Perez','Diana Vega','Paula Mora'];
      const cName = names[Math.floor(Math.random() * names.length)];
      return {
        seller_id: sellerId,
        plan_type: `${planKey} ${annual ? 'ANUAL' : 'MENSUAL'}`,
        amount: basePrice,
        commission_earned: basePrice * rate,
        customer_name: cName,
        customer_phone: `+593 9${Math.floor(Math.random() * 89999999 + 10000000)}`,
        customer_email: `${cName.toLowerCase().replace(/\s+/g,'')}${Math.floor(Math.random()*9999)}@gmail.com`,
        customer_notes: 'Escenario prueba completo.',
        status: 'COMPLETED',
        sede_id: sedeId,
        // En el mes en curso las ventas no pueden ser futuras: se reparten
        // entre el día 1 y hoy. En meses pasados, cualquier día del 1 al 28.
        created_at: new Date(
          now.getFullYear(),
          now.getMonth() - monthOffset,
          monthOffset === 0
            ? Math.floor(Math.random() * now.getDate()) + 1
            : Math.floor(Math.random() * 28) + 1
        ).toISOString()
      };
    };

    // Helper to process a seller
    const processSeller = async (name, email, parentId, numMensual, numAnual, rate = 0.07) => {
      // Create profile first
      const profile = {
        full_name: name,
        email: email,
        password: 'connexo123',
        role: ROLES.SELLER,
        tier: 'PRO',
        tier_start_date: thisMonthISO,
        is_certified: true,
        wallet_balance: 0,
        parent_id: parentId,
        sede_asignada: 'sede-ec-1'
      };
      
      const { data: userData, error: userErr } = await supabase.from('profiles').insert([profile]).select().single();
      if (userErr) throw new Error(`Error creando vendedor ${name}: ` + userErr.message);

      // Generate sales — mes en curso
      const sales = [];
      for (let i = 0; i < numMensual; i++) sales.push(makeSale(userData.id, 'PRO', false));
      for (let i = 0; i < numAnual; i++) sales.push(makeSale(userData.id, i % 2 === 0 ? 'PRO' : 'ULTRA', true));

      // HISTORIAL: los 2 meses anteriores al ~50% del volumen, para que el
      // Super Admin pueda comparar meses y ver el reinicio mensual de nivel
      for (let mes = 1; mes <= 2; mes++) {
        for (let i = 0; i < Math.ceil(numMensual / 2); i++) sales.push(makeSale(userData.id, 'PRO', false, 'sede-ec-1', mes));
        for (let i = 0; i < Math.ceil(numAnual / 2); i++) sales.push(makeSale(userData.id, i % 2 === 0 ? 'PRO' : 'ULTRA', true, 'sede-ec-1', mes));
      }

      // Insertar las ventas de ESTE vendedor de inmediato (no en bulk al final):
      // si el proceso se interrumpe, los vendedores ya creados conservan sus ventas
      const { error: salesErr } = await supabase.from('sales').insert(sales);
      if (salesErr) throw new Error(`Error insertando ventas de ${name}: ` + salesErr.message);

      const walletTotal = sales.reduce((a, s) => a + s.commission_earned, 0);

      // Update wallet balance immediately
      await supabase.from('profiles').update({ wallet_balance: walletTotal }).eq('id', userData.id);

      return { userData, sales };
    };

    // ── 1. VENDEDOR 1 — VENDEDOR PRO (8 anuales = meta + 6 mensuales = 14) ──
    const { userData: v1 } = await processSeller('Vendedor 1 — PRO', 'vendedor1.pro@connexo.ec', adminId || null, 6, 8);

    // ── 2. VENDEDOR 2 — VENDEDOR ULTRA (13 anuales = meta + 40 mensuales = 53,
    //      supera los 50 planes del mes, así que el nivel ULTRA es real) ──────
    const { userData: v2 } = await processSeller('Vendedor 2 — ULTRA', 'vendedor2.ultra@connexo.ec', adminId || null, 40, 13);
    // V2 is ULTRA, update tier
    await supabase.from('profiles').update({ tier: 'ULTRA' }).eq('id', v2.id);

    // ── 3. DISTRIBUIDOR 1 — D1 (3 vendedores × 34 planes = 102 de equipo:
    //      27 anuales (meta 25) y supera su cuota de 100, sin llegar a D2) ────
    const d1Profile = {
      full_name: 'Distribuidor 1',
      email: 'distribuidor1@connexo.ec',
      password: 'connexo123',
      role: ROLES.DISTRIBUTOR,
      tier: 'D1',
      tier_start_date: thisMonthISO,
      is_certified: true,
      wallet_balance: 0,
      parent_id: adminId || null,
      sede_asignada: 'sede-ec-1'
    };
    const { data: d1, error: d1Err } = await supabase.from('profiles').insert([d1Profile]).select().single();
    if (d1Err) throw new Error('Error creando Distribuidor 1: ' + d1Err.message);

    let d1WalletTotal = 0;
    for (let sv = 1; sv <= 3; sv++) {
      const { sales } = await processSeller(`Vendedor D1-${sv}`, `vendedor.d1.${sv}@connexo.ec`, d1.id, 25, 9);
      d1WalletTotal += sales.reduce((a, s) => a + s.amount * 0.12, 0);
    }
    await supabase.from('profiles').update({ wallet_balance: d1WalletTotal }).eq('id', d1.id);

    // ── 4. DISTRIBUIDOR 2 — D2 (5 vendedores × 42 planes = 210 de equipo:
    //      55 anuales (meta 50) y supera los 200 que exige el nivel D2) ───────
    const d2Profile = {
      full_name: 'Distribuidor 2',
      email: 'distribuidor2@connexo.ec',
      password: 'connexo123',
      role: ROLES.DISTRIBUTOR,
      tier: 'D2',
      tier_start_date: thisMonthISO,
      is_certified: true,
      wallet_balance: 0,
      parent_id: adminId || null,
      sede_asignada: 'sede-ec-1'
    };
    const { data: d2, error: d2Err } = await supabase.from('profiles').insert([d2Profile]).select().single();
    if (d2Err) throw new Error('Error creando Distribuidor 2: ' + d2Err.message);

    let d2WalletTotal = 0;
    for (let sv = 1; sv <= 5; sv++) {
      const { sales } = await processSeller(`Vendedor D2-${sv}`, `vendedor.d2.${sv}@connexo.ec`, d2.id, 31, 11);
      d2WalletTotal += sales.reduce((a, s) => a + s.amount * 0.15, 0);
    }
    await supabase.from('profiles').update({ wallet_balance: d2WalletTotal }).eq('id', d2.id);

    // ── 5. DISTRIBUIDOR 3 — D3 (10 vendedores × 31 planes = 310 de equipo:
    //      100 anuales (meta 75) y supera los 300 que exige el nivel D3) ──────
    const d3Profile = {
      full_name: 'Distribuidor 3',
      email: 'distribuidor3@connexo.ec',
      password: 'connexo123',
      role: ROLES.DISTRIBUTOR,
      tier: 'D3',
      tier_start_date: thisMonthISO,
      is_certified: true,
      wallet_balance: 0,
      parent_id: adminId || null,
      sede_asignada: 'sede-ec-1'
    };
    const { data: d3, error: d3Err } = await supabase.from('profiles').insert([d3Profile]).select().single();
    if (d3Err) throw new Error('Error creando Distribuidor 3: ' + d3Err.message);

    let d3WalletTotal = 0;
    for (let sv = 1; sv <= 10; sv++) {
      const { sales } = await processSeller(`Vendedor D3-${sv}`, `vendedor.d3.${sv}@connexo.ec`, d3.id, 21, 10);
      d3WalletTotal += sales.reduce((a, s) => a + s.amount * 0.18, 0);
    }
    await supabase.from('profiles').update({ wallet_balance: d3WalletTotal }).eq('id', d3.id);

    _metricsCache.clear();
    return {
      vendedor1: v1,
      vendedor2: v2,
      distribuidor1: d1,
      distribuidor2: d2,
      distribuidor3: d3
    };
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
      safeSetItem('connexo_team', JSON.stringify(team));
      return newAdmin;
    }
  }
};
