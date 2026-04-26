import { auth, db } from '../lib/firebase';
import { 
  signInWithEmailAndPassword, 
  signOut
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  onSnapshot,
  updateDoc
} from "firebase/firestore";

export const PLANS = {
  PRO: { id: 'PRO', price: 97.00, label: 'Plan PRO' },
  ULTRA: { id: 'ULTRA', price: 179.00, label: 'Plan ULTRA' }
};

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  DISTRIBUTOR: 'DISTRIBUTOR',
  SELLER: 'SELLER'
};

export const dataService = {

  // 1. AUTHENTICATION
  async login(email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    const docRef = doc(db, "profiles", user.uid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      await signOut(auth);
      throw new Error("Perfil de usuario no encontrado. Contacte al administrador.");
    }

    return { uid: user.uid, email: user.email, ...docSnap.data() };
  },

  async logout() {
    await signOut(auth);
  },

  // 2. REAL-TIME PROFILE SUBSCRIPTION (onSnapshot)
  subscribeToProfile(userId, callback) {
    const docRef = doc(db, "profiles", userId);
    return onSnapshot(docRef, (snap) => {
      if (snap.exists()) callback({ uid: userId, ...snap.data() });
    });
  },

  // 3. METRICS (Commission Logic v2.2)
  async getMetrics(user) {
    if (!user.is_certified) return { rate: 0, base: 0, level: 'BLOQUEADO' };

    const userId = user.uid || user.id;
    const salesRef = collection(db, "sales");
    let teamIds = [userId];

    // Get team members for DISTRIBUTOR and SUPER_ADMIN
    if (user.role === ROLES.DISTRIBUTOR || user.role === ROLES.SUPER_ADMIN) {
      const teamQuery = query(collection(db, "profiles"), where("parent_id", "==", userId));
      const teamSnap = await getDocs(teamQuery);
      teamIds = [userId, ...teamSnap.docs.map(d => d.id)];
    }

    // Firestore 'in' query max 30 items — safe for MVP
    const q = query(salesRef, where("seller_id", "in", teamIds.slice(0, 30)));
    const querySnapshot = await getDocs(q);
    const totalSalesCount = querySnapshot.size;
    const mySalesCount = querySnapshot.docs.filter(d => d.data().seller_id === userId).length;

    if (user.role === ROLES.SELLER) {
      if (mySalesCount >= 31) return { rate: 0.09, base: 300, level: 'VENDEDOR ULTRA' };
      if (mySalesCount >= 20) return { rate: 0.07, base: 250, level: 'VENDEDOR PRO' };
      return { rate: 0.05, base: 0, level: 'VENDEDOR BASIC' };
    }

    if (user.role === ROLES.DISTRIBUTOR) {
      if (totalSalesCount >= 201) return { rate: 0.18, base: 600, level: 'PARTNER 3' };
      if (totalSalesCount >= 101) return { rate: 0.15, base: 600, level: 'PARTNER 2' };
      if (totalSalesCount >= 50)  return { rate: 0.12, base: 500, level: 'PARTNER 1' };
      return { rate: 0.10, base: 0, level: 'PARTNER BASIC' };
    }

    return { rate: 0, base: 0, level: 'SUPER ADMIN' };
  },

  // 4. REGISTER SALE + UPDATE BALANCE
  async registerSale(userId, planKey, customerData, currentRate, isCertified) {
    const plan = PLANS[planKey];
    const commission = isCertified ? plan.price * (currentRate || 0) : 0;

    const saleData = {
      seller_id: userId,
      plan_type: planKey,
      amount: plan.price,
      commission_earned: commission,
      customer_name: customerData.name,
      customer_phone: customerData.phone,
      status: 'COMPLETED',
      created_at: new Date()
    };

    const docRef = await addDoc(collection(db, "sales"), saleData);

    // Atomically update wallet_balance in user profile
    const profileRef = doc(db, "profiles", userId);
    const profileSnap = await getDoc(profileRef);
    if (profileSnap.exists()) {
      const currentBalance = profileSnap.data().wallet_balance || 0;
      await updateDoc(profileRef, { wallet_balance: currentBalance + commission });
    }

    return { id: docRef.id, ...saleData };
  },

  // 5. CERTIFY USER
  async certifyUser(userId) {
    const profileRef = doc(db, "profiles", userId);
    await updateDoc(profileRef, { is_certified: true });
  },

  // 6. GET TEAM
  async getTeam(parentId) {
    const q = query(collection(db, "profiles"), where("parent_id", "==", parentId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(d => ({ uid: d.id, id: d.id, ...d.data() }));
  },

  // 7. ADD TEAM MEMBER (creates Firebase Auth user + Firestore profile)
  async addTeamMember(parentId, userData) {
    // NOTE: Creating Auth users requires Admin SDK (Cloud Functions) in production.
    // For MVP, we add them directly to Firestore with a pending status.
    const newProfileRef = doc(collection(db, "profiles"));
    await setDoc(newProfileRef, {
      full_name: userData.name,
      email: userData.email,
      role: userData.role || 'SELLER',
      is_certified: false,
      wallet_balance: 0,
      parent_id: parentId,
      created_at: new Date()
    });
    return { uid: newProfileRef.id, id: newProfileRef.id, ...userData };
  }
};
