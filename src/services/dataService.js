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
        const { count: salesSinceAssignment } = await countSales(
          supabase.from('sales').select('*', { count: 'exact', head: true }).eq('seller_id', uid)
        );
        const total = salesSinceAssignment || 0;
        // Si ya superó los umbrales del siguiente nivel, subir automáticamente
        if (total >= 31) return cache({ rate: 0.09, base: 300, level: 'VENDEDOR ULTRA', salesCount: total });
        if (total >= 20) return cache({ rate: 0.07, base: 250, level: 'VENDEDOR PRO',   salesCount: total });
      }
      return cache({ rate: manualTier.rate, base: manualTier.base, level: manualTier.label, salesCount: 0 });
    }
  }

  // ─── VENDEDOR (Auto) ──────────────────────────────────────────────────
  if (user.role === ROLES.SELLER) {
    const { count: mySales } = await countSales(
      supabase.from('sales').select('*', { count: 'exact', head: true }).eq('seller_id', uid)
    );
    const total = mySales || 0;
    if (total >= 31) return cache({ rate: 0.09, base: 300, level: 'VENDEDOR ULTRA', salesCount: total });
    if (total >= 20) return cache({ rate: 0.07, base: 250, level: 'VENDEDOR PRO',   salesCount: total });
    return cache({ rate: 0.07, base: 0, level: 'VENDEDOR BASIC', salesCount: total, isPreview: true });
  }

  // ─── DISTRIBUIDOR (Auto) ──────────────────────────────────────────────
  if (user.role === ROLES.DISTRIBUTOR) {
    const { data: team } = await supabase.from('profiles').select('id').eq('parent_id', uid);
    const teamIds = [uid, ...(team?.map(t => t.id) || [])];

    const { count: teamSales } = await countSales(
      supabase.from('sales').select('*', { count: 'exact', head: true }).in('seller_id', teamIds)
    );
    const total = teamSales || 0;
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
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();
      
    if (error || !data) throw new Error('Credenciales incorrectas. Verifica tu email y contraseña.');

    // Validar que el rol seleccionado en la UI coincida con el rol real
    if (selectedRole) {
      const roleMap = {
        'VENDEDOR':    'SELLER',
        'DISTRIBUIDOR': 'DISTRIBUTOR'
      };
      const expectedRole = roleMap[selectedRole];
      if (expectedRole && data.role !== expectedRole) {
        throw new Error(`Acceso denegado. Tu cuenta está registrada como ${data.role === 'SELLER' ? 'Vendedor' : 'Distribuidor'}.`);
      }
    }

    _currentUser = data;
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

    const { data: sale, error } = await supabase
      .from('sales')
      .insert([newSale])
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Actualizar billetera localmente y en db
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

    _metricsCache.clear(); // ⚡ Invalidad cache de métricas en tiempo real
    return sale;
  },

  // Sales solo propias (vendedor)
  async getSales(userId) {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .eq('seller_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  // Sales de todo el equipo (distribuidor / super admin)
  async getSalesForTeam(userId, role) {
    let teamIds = [userId];

    if (role === ROLES.SUPER_ADMIN) {
      // Super admin: todas las ventas del sistema
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    }

    // Distribuidor: sus propias ventas + ventas de su equipo
    const { data: team } = await supabase
      .from('profiles')
      .select('id')
      .eq('parent_id', userId);

    if (team?.length) teamIds = [userId, ...team.map(m => m.id)];

    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .in('seller_id', teamIds)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  },

  async getTeam(parentId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('parent_id', parentId)
      .order('created_at', { ascending: true });
      
    if (error) throw new Error(error.message);
    return data.map(({ password, ...rest }) => rest);
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
      parent_id: parentId
    };

    const { data, error } = await supabase
      .from('profiles')
      .insert([newProfile])
      .select()
      .single();

    if (error) throw new Error(error.message);
    const { password, ...safeProfile } = data;
    return safeProfile;
  },

  async certifyUser(userId) {
    const { error } = await supabase
      .from('profiles')
      .update({ is_certified: true })
      .eq('id', userId);
      
    if (error) throw new Error(error.message);
    
    if (_currentUser && (_currentUser.id === userId || _currentUser.uid === userId)) {
      _currentUser.is_certified = true;
    }
    _metricsCache.clear(); // ⚡ Invalidad cache de métricas en tiempo real
    return true;
  },

  async getAllProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    _metricsCache.clear(); // ⚡ Invalidad cache de métricas en tiempo real
    return data;
  },

  // ─── GESTIÓN DE INVENTARIO (Real + LocalStorage Fallback) ──────────────────
  async getInventory() {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn("⚠️ No se pudo cargar inventario de Supabase, usando LocalStorage fallback:", err.message);
      const cached = localStorage.getItem('connexo_inventory');
      if (cached) return JSON.parse(cached);

      const defaultInventory = [
        { id: 'inv-1', name: 'Tarjetas NFC', description: 'Tarjetas de presentación inteligente con tecnología NFC', category: 'NFC', stock_quantity: 500, unit_type: 'UNIDAD', detail_packaging: 'Cajas de 100 u.' },
        { id: 'inv-2', name: 'Pulseras NFC', description: 'Pulseras ajustables con chip NFC integrado', category: 'NFC', stock_quantity: 300, unit_type: 'UNIDAD', detail_packaging: 'Bolsas de 50 u.' },
        { id: 'inv-3', name: 'Chips NFC', description: 'Stickers / Chips NFC adhesivos pequeños', category: 'NFC', stock_quantity: 1000, unit_type: 'UNIDAD', detail_packaging: 'Empaques de 200 u.' },
        { id: 'inv-4', name: 'Cajas de Presentación', description: 'Cajas elegantes de empaque para productos NFC', category: 'PACKAGING', stock_quantity: 200, unit_type: 'UNIDAD', detail_packaging: 'Caja Kraft Premium' },
        { id: 'inv-5', name: 'Empaques Connexo', description: 'Empaques sellados con branding de Connexo', category: 'PACKAGING', stock_quantity: 400, unit_type: 'UNIDAD', detail_packaging: 'Sobres acolchados' }
      ];
      localStorage.setItem('connexo_inventory', JSON.stringify(defaultInventory));
      return defaultInventory;
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
        detail_packaging: itemData.detail_packaging || ''
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
      const items = await this.getInventory();
      const newItem = {
        id: `inv-${Date.now()}`,
        name: itemData.name,
        description: itemData.description || '',
        category: itemData.category || 'NFC',
        stock_quantity: Number(itemData.stock_quantity) || 0,
        unit_type: itemData.unit_type || 'UNIDAD',
        detail_packaging: itemData.detail_packaging || ''
      };
      items.push(newItem);
      localStorage.setItem('connexo_inventory', JSON.stringify(items));
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

    // Limpiar LocalStorage preservando la sesión del admin y los avatars/insignias guardados
    const keysToPreserve = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key === 'connexo_session' || key.startsWith('connexo_avatar_') || key.startsWith('connexo_badges_'))) {
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
  }
};
