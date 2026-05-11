import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, CheckCircle, Lock, BookOpen, Plus, Trash2, Edit, Award, FileText, HelpCircle, Eye, EyeOff } from 'lucide-react';
import { dataService } from '../../services/dataService';

const Academy = ({ user, onCertify }) => {
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [courses, setCourses] = useState([]);
  const [isAdminView, setIsAdminView] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizSuccess, setQuizSuccess] = useState(false);
  
  // Admin Form States
  const [title, setTitle] = useState('');
  const [type, setType] = useState('video');
  const [url, setUrl] = useState('');
  const [duration, setDuration] = useState('');
  const [description, setDescription] = useState('');
  
  // Custom Quiz Admin States (up to 3 questions)
  const [quizQuestions, setQuizQuestions] = useState([
    { question: '', options: ['', '', ''], answer: 0 }
  ]);

  useEffect(() => {
    loadAcademy();
  }, []);

  const loadAcademy = async () => {
    const data = await dataService.getAcademyCourses();
    setCourses(data);
  };

  const handleAddCourse = async (e) => {
    e.preventDefault();
    if (!title || !duration) return;

    const newCourse = {
      id: Date.now().toString(),
      title,
      type,
      url: type === 'quiz' ? '' : url,
      duration,
      description,
      questions: type === 'quiz' ? quizQuestions : null
    };

    const updated = [...courses, newCourse];
    setCourses(updated);
    await dataService.saveAcademyCourses(updated);

    // Reset Form
    setTitle('');
    setUrl('');
    setDuration('');
    setDescription('');
    setQuizQuestions([{ question: '', options: ['', '', ''], answer: 0 }]);
  };

  const handleDeleteCourse = async (id) => {
    const updated = courses.filter(c => c.id !== id);
    setCourses(updated);
    await dataService.saveAcademyCourses(updated);
  };

  const handleQuizAnswer = (qIndex, oIndex) => {
    setQuizAnswers(prev => ({ ...prev, [qIndex]: oIndex }));
  };

  const submitQuiz = () => {
    if (!activeQuiz) return;
    const questions = activeQuiz.questions || [];
    let allCorrect = true;

    for (let i = 0; i < questions.length; i++) {
      if (quizAnswers[i] !== questions[i].answer) {
        allCorrect = false;
        break;
      }
    }

    setQuizSubmitted(true);
    setQuizSuccess(allCorrect);

    if (allCorrect) {
      onCertify(); // Trigger certification in core App.jsx
    }
  };

  return (
    <div style={{ padding: '0 1.5rem 100px', fontFamily: 'var(--font-main)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>Academia Connexo</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Capacitación y Certificaciones oficiales de red.</p>
        </div>
        {isSuperAdmin && (
          <button 
            onClick={() => setIsAdminView(!isAdminView)} 
            className="btn glass"
            style={{ fontSize: '0.75rem', textTransform: 'uppercase', borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            {isAdminView ? <><Eye size={14} style={{ marginRight: '6px' }} /> Vista Alumno</> : <><Edit size={14} style={{ marginRight: '6px' }} /> Panel Admin</>}
          </button>
        )}
      </div>

      {/* Student Cert Status banner */}
      {!isAdminView && (
        <div 
          className="card glass" 
          style={{ 
            marginBottom: '2rem', 
            border: user.is_certified ? '1px solid var(--success)' : '1px solid var(--accent)',
            background: user.is_certified ? 'rgba(0, 255, 157, 0.05)' : 'rgba(255, 102, 0, 0.05)'
          }}
        >
          {user.is_certified ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Award size={36} color="var(--success)" style={{ filter: 'drop-shadow(0 0 8px rgba(0,255,157,0.4))' }} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--success)', fontFamily: 'var(--font-heading)' }}>CERTIFICACIÓN ACTIVA</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.8 }}>¡Felicidades! Tienes acceso completo a comisiones, bonos y sueldos base.</p>
              </div>
            </div>
          ) : (
            <div>
              <h3 style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontFamily: 'var(--font-heading)', margin: 0 }}>
                <Lock size={18} /> COMISIONES BLOQUEADAS
              </h3>
              <p style={{ fontSize: '0.8rem', marginTop: '6px', opacity: 0.9 }}>
                Debes aprobar el **Examen de Certificación Oficial** abajo para desbloquear el cálculo de tus comisiones y sueldos base de red.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {isAdminView ? (
        /* SUPER ADMIN UPLOAD PANEL */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <form onSubmit={handleAddCourse} className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--accent-glow)' }}>
            <h3 style={{ fontSize: '0.95rem', textTransform: 'uppercase', color: 'var(--accent)', margin: '0 0 10px', fontFamily: 'var(--font-heading)' }}>Subir Nuevo Material</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.6, display: 'block', marginBottom: '6px' }}>Tipo de Material</label>
                <select 
                  value={type} 
                  onChange={(e) => setType(e.target.value)}
                  style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px', fontSize: '0.9rem' }}
                >
                  <option value="video">Video (YouTube / Vimeo)</option>
                  <option value="document">Documento o PDF</option>
                  <option value="quiz">Cuestionario / Examen</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.6, display: 'block', marginBottom: '6px' }}>Duración Estimada</label>
                <input 
                  value={duration} 
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="Ej: 15 min" required
                  style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px', fontSize: '0.9rem' }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.6, display: 'block', marginBottom: '6px' }}>Título del Material</label>
              <input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título descriptivo" required
                style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px', fontSize: '0.9rem' }}
              />
            </div>

            {type !== 'quiz' && (
              <div>
                <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.6, display: 'block', marginBottom: '6px' }}>URL de Enlace</label>
                <input 
                  value={url} 
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..." required={type !== 'quiz'}
                  style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px', fontSize: '0.9rem' }}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.6, display: 'block', marginBottom: '6px' }}>Descripción Breve</label>
              <textarea 
                value={description} 
                onChange={(e) => setDescription(e.target.value)}
                placeholder="¿De qué trata este material?" rows={2}
                style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px', fontSize: '0.9rem', resize: 'none', fontFamily: 'inherit' }}
              />
            </div>

            {/* Quiz Builder (Only for type === 'quiz') */}
            {type === 'quiz' && (
              <div style={{ padding: '12px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', margin: 0 }}>Configurar Preguntas del Examen</p>
                {quizQuestions.map((q, qIndex) => (
                  <div key={qIndex} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', pb: '12px', mb: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input 
                      placeholder={`Pregunta #${qIndex + 1}`} required
                      value={q.question}
                      onChange={(e) => {
                        const updated = [...quizQuestions];
                        updated[qIndex].question = e.target.value;
                        setQuizQuestions(updated);
                      }}
                      style={{ width: '100%', padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px', fontSize: '0.85rem' }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      {q.options.map((opt, oIndex) => (
                        <input 
                          key={oIndex} placeholder={`Opción ${String.fromCharCode(65 + oIndex)}`} required
                          value={opt}
                          onChange={(e) => {
                            const updated = [...quizQuestions];
                            updated[qIndex].options[oIndex] = e.target.value;
                            setQuizQuestions(updated);
                          }}
                          style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', color: 'white', borderRadius: '6px', fontSize: '0.8rem' }}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.7rem', opacity: 0.6, textTransform: 'uppercase' }}>Respuesta Correcta:</span>
                      <select 
                        value={q.answer}
                        onChange={(e) => {
                          const updated = [...quizQuestions];
                          updated[qIndex].answer = Number(e.target.value);
                          setQuizQuestions(updated);
                        }}
                        style={{ background: 'rgba(0,0,0,0.3)', color: 'var(--accent)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        <option value={0}>Opción A</option>
                        <option value={1}>Opción B</option>
                        <option value={2}>Opción C</option>
                      </select>
                    </div>
                  </div>
                ))}
                {quizQuestions.length < 3 && (
                  <button 
                    type="button" 
                    onClick={() => setQuizQuestions([...quizQuestions, { question: '', options: ['', '', ''], answer: 0 }])}
                    className="btn glass" 
                    style={{ fontSize: '0.7rem', alignSelf: 'flex-start', padding: '6px 12px' }}
                  >
                    + Agregar Pregunta
                  </button>
                )}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '48px', color: 'var(--bg-primary)', textTransform: 'uppercase', fontSize: '0.85rem' }}>
              Publicar en la Academia
            </button>
          </form>

          {/* List of courses in Admin View */}
          <div>
            <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', opacity: 0.6, letterSpacing: '1px', marginBottom: '1rem' }}>Materiales Publicados</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {courses.map(course => (
                <div key={course.id} className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {course.type === 'video' ? <Play size={16} /> : course.type === 'quiz' ? <HelpCircle size={16} /> : <FileText size={16} />}
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>{course.title}</h4>
                      <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.5 }}>{course.type.toUpperCase()} • {course.duration}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteCourse(course.id)} 
                    style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '8px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* STUDENTS COURSE LIST VIEW */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {courses.map((course) => (
            <div key={course.id} className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                    {course.type === 'video' ? <Play size={18} /> : course.type === 'quiz' ? <HelpCircle size={18} /> : <FileText size={18} />}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{course.title}</h4>
                    <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.5 }}>{course.duration} • {course.type === 'video' ? 'Video' : course.type === 'quiz' ? 'Examen de Certificación' : 'Documento Formativo'}</p>
                  </div>
                </div>
                
                {/* Actions */}
                {course.type === 'video' && course.url && (
                  <button 
                    onClick={() => window.open(course.url, '_blank')}
                    className="btn btn-primary" 
                    style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--bg-primary)' }}
                  >
                    <Play size={12} fill="var(--bg-primary)" /> Ver
                  </button>
                )}

                {course.type === 'document' && course.url && (
                  <button 
                    onClick={() => window.open(course.url, '_blank')}
                    className="btn glass" 
                    style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', borderColor: 'rgba(255,255,255,0.15)' }}
                  >
                    <FileText size={12} /> Leer
                  </button>
                )}

                {course.type === 'quiz' && (
                  <button 
                    onClick={() => {
                      setActiveQuiz(course);
                      setQuizAnswers({});
                      setQuizSubmitted(false);
                      setQuizSuccess(false);
                    }}
                    className="btn" 
                    style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: user.is_certified ? 'rgba(0,255,157,0.1)' : 'var(--accent)', color: user.is_certified ? 'var(--success)' : 'var(--bg-primary)' }}
                  >
                    {user.is_certified ? <><CheckCircle size={12} /> Examen Aprobado</> : <><HelpCircle size={12} /> Evaluar</>}
                  </button>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', opacity: 0.7, lineHeight: '1.4' }}>{course.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Dynamic Quiz Modal — Portal wraps AnimatePresence, not the other way around */}
      {activeQuiz && createPortal(
        <AnimatePresence>
          <motion.div 
            key="quiz-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
            onClick={() => setActiveQuiz(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              style={{ background: 'linear-gradient(135deg, #111, #1a0f08)', border: '1px solid var(--accent-glow)', borderRadius: '16px', padding: '2rem', maxWidth: '480px', width: '100%', position: 'relative', maxHeight: '85vh', overflowY: 'auto' }}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setActiveQuiz(null)} style={{ position: 'absolute', top: 12, right: 12, background: 'transparent', border: 'none', color: '#fff', fontSize: '1.1rem', cursor: 'pointer' }}>✕</button>
              
              <h3 style={{ margin: '0 0 4px', fontSize: '1.2rem', color: 'white', fontFamily: 'var(--font-heading)' }}>{activeQuiz.title}</h3>
              <p style={{ margin: '0 0 1.5rem', fontSize: '0.75rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '1px' }}>Certificación Oficial</p>
              
              {!quizSubmitted ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                  {(activeQuiz.questions || []).map((q, qIndex) => (
                    <div key={qIndex} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>{qIndex + 1}. {q.question}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {q.options.map((opt, oIndex) => {
                          const isSelected = quizAnswers[qIndex] === oIndex;
                          return (
                            <button
                              key={oIndex}
                              onClick={() => handleQuizAnswer(qIndex, oIndex)}
                              style={{
                                width: '100%', padding: '10px 14px', textAlign: 'left',
                                background: isSelected ? 'rgba(255,102,0,0.1)' : 'rgba(255,255,255,0.02)',
                                border: isSelected ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '8px', color: 'white', fontSize: '0.8rem', cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {String.fromCharCode(65 + oIndex)}) {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    onClick={submitQuiz}
                    disabled={Object.keys(quizAnswers).length < (activeQuiz.questions || []).length}
                    className="btn btn-primary" 
                    style={{ width: '100%', height: '48px', color: 'var(--bg-primary)', textTransform: 'uppercase', fontSize: '0.85rem', marginTop: '1rem' }}
                  >
                    Enviar Respuestas
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  {quizSuccess ? (
                    <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(0,255,157,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}><Award size={32} color="var(--success)" /></div>
                      <h4 style={{ color: 'var(--success)', margin: 0, fontSize: '1.2rem', fontFamily: 'var(--font-heading)' }}>¡EXAMEN APROBADO!</h4>
                      <p style={{ fontSize: '0.85rem', opacity: 0.8, maxWidth: '300px', margin: '4px 0 20px' }}>Has respondido correctamente todas las preguntas. Tu certificación oficial ya está activa en tu red.</p>
                      <button onClick={() => setActiveQuiz(null)} className="btn btn-primary" style={{ padding: '10px 24px', color: 'var(--bg-primary)' }}>Listo</button>
                    </motion.div>
                  ) : (
                    <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 'bold', color: 'var(--danger)' }}>X</div>
                      <h4 style={{ color: 'var(--danger)', margin: 0, fontSize: '1.2rem', fontFamily: 'var(--font-heading)' }}>EXAMEN NO APROBADO</h4>
                      <p style={{ fontSize: '0.85rem', opacity: 0.8, maxWidth: '300px', margin: '4px 0 20px' }}>Algunas respuestas son incorrectas. Repasa los materiales de formación y vuelve a intentarlo.</p>
                      <button onClick={() => setQuizSubmitted(false)} className="btn" style={{ padding: '10px 24px', background: 'var(--accent)', color: 'var(--bg-primary)' }}>Reintentar</button>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default Academy;
