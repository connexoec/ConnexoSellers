import React from 'react';
import { motion } from 'framer-motion';
import { Play, CheckCircle, Lock, BookOpen } from 'lucide-react';

const courses = [
  { id: 1, title: "Fundamentos del Ecosistema", duration: "15 min", status: "COMPLETED" },
  { id: 2, title: "Técnicas de Venta Directa", duration: "25 min", status: "AVAILABLE" },
  { id: 3, title: "Liderazgo y Gestión de Equipos", duration: "40 min", status: "LOCKED" },
];

const Academy = ({ user, onCertify }) => {
  return (
    <div style={{ padding: '0 1.5rem 100px', fontFamily: 'Verdana, sans-serif' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.4rem', textTransform: 'uppercase' }}>Academia Connexo</h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Potencia tus habilidades y desbloquea tus comisiones.</p>
      </div>

      {!user.is_certified && (
        <div 
            className="card glass" 
            style={{ marginBottom: '2rem', border: '1px solid var(--accent)' }}
            role="alert"
            aria-live="polite"
        >
            <h3 style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                <Lock size={18} /> BENEFICIOS BLOQUEADOS
            </h3>
            <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>
                Debes aprobar la certificación para activar el cálculo de comisiones y sueldos base.
            </p>
            <button 
                onClick={onCertify} 
                className="btn btn-primary" 
                style={{ marginTop: '1.5rem', width: '100%', textTransform: 'uppercase', letterSpacing: '1px' }}
                aria-label="Completar certificación académica ahora"
            >
                Aprobar Certificación
            </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {courses.map((course) => (
          <div key={course.id} className="card glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: course.status === 'LOCKED' ? 0.5 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {course.status === 'COMPLETED' ? <CheckCircle size={20} color="#10b981" /> : <BookOpen size={20} />}
                </div>
                <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{course.title}</h4>
                    <p style={{ margin: 0, fontSize: '0.75rem' }}>{course.duration}</p>
                </div>
            </div>
            {course.status === 'AVAILABLE' && (
                <button className="btn" style={{ padding: '8px 12px', background: 'var(--accent)', color: 'black' }}>
                    <Play size={14} fill="black" />
                </button>
            )}
            {course.status === 'LOCKED' && <Lock size={16} />}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Academy;
