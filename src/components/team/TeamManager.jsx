import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { dataService } from '../../services/dataService';

const TeamManager = ({ users, currentUser, onAddUser, sales }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Firebase uses uid, fallback to id for compatibility
  const currentUid = currentUser?.uid || currentUser?.id;

  const myTeam = users.filter(u => (u.parent_id === currentUid));
  const teamIds = myTeam.map(u => u.uid || u.id);
  const teamSales = sales.filter(s => teamIds.includes(s.seller_id));
  const teamVolume = teamSales.reduce((acc, s) => acc + (s.amount || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const userData = {
        name: e.target.name.value,
        email: e.target.email.value,
        role: e.target.role?.value || 'SELLER',
        parent_id: currentUid
      };
      const newUser = await dataService.addTeamMember(currentUid, userData);
      onAddUser(newUser);
      setIsAdding(false);
      e.target.reset();
    } catch (err) {
      alert("Error al agregar miembro: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.setFont('helvetica');
    doc.text(`Reporte de Red - ${currentUser?.full_name || currentUser?.name || ''}`, 14, 20);
    doc.autoTable({
      startY: 30,
      head: [['Vendedor', 'Email', 'Certificado', 'Ventas']],
      body: myTeam.map(u => [
        u.full_name || u.name || 'N/A',
        u.email || '',
        u.is_certified ? 'Sí' : 'No',
        `$${sales.filter(s => s.seller_id === (u.uid || u.id)).reduce((acc, s) => acc + (s.amount || 0), 0).toFixed(2)}`
      ])
    });
    doc.save('reporte_red_connexo.pdf');
  };

  return (
    <div style={{ padding: '0 1.5rem 100px', fontFamily: 'Verdana, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.4rem', textTransform: 'uppercase' }}>Gestión de Red</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={generatePDF} className="btn glass" style={{ width: '44px', height: '44px', padding: 0 }} aria-label="Descargar PDF">
            <Download size={18} />
          </button>
          <button onClick={() => setIsAdding(!isAdding)} className="btn btn-primary" style={{ width: '44px', height: '44px', padding: 0 }} aria-label="Agregar vendedor">
            <UserPlus size={18} />
          </button>
        </div>
      </div>

      <div className="card glass" style={{ marginBottom: '2rem', border: '1px solid var(--success)' }}>
        <p style={{ fontSize: '0.7rem', textTransform: 'uppercase' }}>Volumen Grupal</p>
        <h2 style={{ margin: '8px 0', color: 'var(--success)' }}>${teamVolume.toFixed(2)}</h2>
        <p style={{ fontSize: '0.8rem', opacity: 0.7 }}>Miembros en red: {myTeam.length}</p>
      </div>

      {isAdding && (
        <motion.form 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          onSubmit={handleSubmit} 
          className="card glass" 
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}
        >
          <input 
            name="name" required 
            placeholder="Nombre completo del vendedor" 
            style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px' }} 
          />
          <input 
            name="email" type="email" required 
            placeholder="Correo electrónico" 
            style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px' }} 
          />
          {currentUser?.role === 'SUPER_ADMIN' && (
            <select name="role" style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', borderRadius: '8px' }}>
              <option value="SELLER">Vendedor</option>
              <option value="DISTRIBUTOR">Distribuidor</option>
            </select>
          )}
          <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>
            ⓘ Se registrará en Firestore. El vendedor deberá crear su contraseña desde Firebase Auth.
          </p>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary" style={{ height: '44px', textTransform: 'uppercase' }}>
            {isSubmitting ? 'Registrando...' : 'Finalizar Registro'}
          </button>
        </motion.form>
      )}

      <h3 style={{ marginBottom: '1rem' }}>Miembros ({myTeam.length})</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {myTeam.length === 0 ? (
          <p style={{ textAlign: 'center', opacity: 0.4, padding: '2rem', fontSize: '0.85rem' }}>
            No hay miembros en tu red aún. Agrega tu primer vendedor.
          </p>
        ) : (
          myTeam.map(u => (
            <div key={u.uid || u.id} className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>{u.full_name || u.name}</p>
                <p style={{ margin: 0, fontSize: '0.7rem' }}>
                  {u.is_certified ? '✓ Certificado' : '⏳ Pendiente'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontWeight: 700, color: 'var(--accent)' }}>
                  ${sales.filter(s => s.seller_id === (u.uid || u.id)).reduce((acc, s) => acc + (s.amount || 0), 0).toFixed(0)}
                </p>
                <p style={{ margin: 0, fontSize: '0.65rem', opacity: 0.5 }}>volumen</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TeamManager;
