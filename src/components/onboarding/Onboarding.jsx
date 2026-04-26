import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, TrendingUp, ArrowRight } from 'lucide-react';

const getSlidesForRole = (role) => {
  const baseSlides = [
    {
      id: 'welcome',
      title: "BIENVENIDO AL ECOSISTEMA",
      description: "La plataforma definitiva para gestionar tu éxito comercial con Connexo.",
      icon: <Shield size={80} color="var(--accent)" />,
      animation: { scale: [0.8, 1.1, 1], rotate: [0, 10, 0] }
    }
  ];

  if (role === 'SUPER_ADMIN') {
    return [
      ...baseSlides,
      {
        id: 'admin_control',
        title: "CONTROL TOTAL",
        description: "Monitorea toda la red, valida certificaciones y ajusta el pulso del ecosistema.",
        icon: <Shield size={80} color="var(--accent)" />,
        animation: { y: [0, -20, 0] }
      }
    ];
  }

  if (role === 'DISTRIBUTOR') {
    return [
      ...baseSlides,
      {
        id: 'distri_team',
        title: "LIDERAZGO DE RED",
        description: "Suma vendedores a tu equipo. Sus ventas te impulsan a los niveles de Partner 1, 2 y 3.",
        icon: <TrendingUp size={80} color="var(--tier-ultra)" />,
        animation: { x: [-20, 20, 0] }
      }
    ];
  }

  return [
    ...baseSlides,
    {
      id: 'seller_growth',
      title: "TU CARRERA COMERCIAL",
      description: "Escala de Basic a Ultra. 20 ventas para PRO, 31 para beneficios máximos.",
      icon: <TrendingUp size={80} color="var(--tier-pro)" />,
      animation: { scale: [1, 1.2, 1] }
    }
  ];
};

const Onboarding = ({ user, onComplete }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = getSlidesForRole(user.role);

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: '2rem',
      background: 'var(--bg-primary)',
      textAlign: 'center',
      fontFamily: 'Verdana, sans-serif'
    }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={slides[currentSlide].id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
          style={{ maxWidth: '400px' }}
        >
          <motion.div 
            animate={slides[currentSlide].animation}
            transition={{ repeat: Infinity, duration: 3 }}
            style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'center' }}
          >
            {slides[currentSlide].icon}
          </motion.div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: 'var(--accent)', textTransform: 'uppercase' }}>
            {slides[currentSlide].title}
          </h1>
          <p style={{ fontSize: '1rem', lineHeight: '1.6', opacity: 0.9 }}>
            {slides[currentSlide].description}
          </p>
        </motion.div>
      </AnimatePresence>

      <div style={{ display: 'flex', gap: '8px', marginTop: '3rem' }}>
        {slides.map((_, index) => (
          <div 
            key={index} 
            style={{ 
              width: index === currentSlide ? '24px' : '8px', 
              height: '8px', 
              borderRadius: '4px', 
              background: index === currentSlide ? 'var(--accent)' : 'rgba(255,255,255,0.2)',
              transition: 'all 0.3s'
            }} 
          />
        ))}
      </div>

      <button 
        onClick={nextSlide} 
        className="btn btn-primary" 
        style={{ 
          marginTop: '2rem', 
          width: '100%', 
          maxWidth: '300px',
          padding: '1.2rem',
          borderRadius: '100px',
          textTransform: 'uppercase',
          letterSpacing: '1px'
        }}
      >
        {currentSlide === slides.length - 1 ? 'Empezar ahora' : 'Siguiente'}
        <ArrowRight size={20} />
      </button>
    </div>
  );
};

export default Onboarding;
