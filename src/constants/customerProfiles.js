import {
  Sparkles, Scissors, UtensilsCrossed, PawPrint, Stethoscope,
  ShoppingCart, Music, Building2, Shirt
} from 'lucide-react';

// Tipo de perfil que el cliente recibe al activarse el plan.
// El `id` es lo que se guarda en sales.profile_type (texto en mayúsculas).
export const CUSTOMER_PROFILES = [
  { id: 'ESTANDAR',     label: 'Estándar',       icon: Sparkles },
  { id: 'BARBERIA',     label: 'Barbería',       icon: Scissors },
  { id: 'GASTRONOMIA',  label: 'Gastronomía',    icon: UtensilsCrossed },
  { id: 'PETCARE',      label: 'Petcare / Vet.', icon: PawPrint },
  { id: 'SALUD',        label: 'Salud / Médico', icon: Stethoscope },
  { id: 'ECOMMERCE',    label: 'E-commerce',     icon: ShoppingCart },
  { id: 'ARTISTA',      label: 'Artista / Músico', icon: Music },
  { id: 'INMOBILIARIA', label: 'Inmobiliaria',   icon: Building2 },
  { id: 'SUBLIMADOS',   label: 'Sublimados / Textil', icon: Shirt }
];

export const DEFAULT_PROFILE_TYPE = 'ESTANDAR';

export const getProfileLabel = (id) =>
  CUSTOMER_PROFILES.find(p => p.id === id)?.label || null;
