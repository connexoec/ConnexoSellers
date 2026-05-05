import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Package, Plus, Minus, Send, Download, Trash2, Edit, Save, X } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { dataService } from '../../services/dataService';

const InventoryManager = ({ user, team, addNotification }) => {
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  
  const [inventory, setInventory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // States for Admin Adding Items
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItemData, setNewItemData] = useState({ name: '', description: '', category: 'NFC', stock_quantity: 0, unit_type: 'UNIDAD', detail_packaging: '' });
  
  // States for Admin Editing
  const [editingItem, setEditingItem] = useState(null);
  const [editData, setEditData] = useState({});
  
  // States for Distributor Request
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestCart, setRequestCart] = useState({}); // { itemId: quantity }
  const [requestNotes, setRequestNotes] = useState('');
  
  // States for filtering requests
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const inv = await dataService.getInventory();
      setInventory(inv);
      
      const reqs = await dataService.getInventoryRequests(isSuperAdmin ? null : user.id);
      setRequests(reqs);
    } catch (err) {
      console.error(err);
      addNotification('Error cargando inventario', 'ERROR');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNewItem = async (e) => {
    e.preventDefault();
    try {
      await dataService.addInventoryItem(newItemData);
      addNotification('Producto añadido al inventario');
      setIsAddingNew(false);
      setNewItemData({ name: '', description: '', category: 'NFC', stock_quantity: 0, unit_type: 'UNIDAD', detail_packaging: '' });
      loadData();
    } catch (err) {
      addNotification(err.message, 'ERROR');
    }
  };

  const handleUpdateStock = async (itemId, amount, type = 'add') => {
    try {
      await dataService.updateInventoryStock(itemId, amount, type);
      addNotification('Stock actualizado');
      loadData();
    } catch (err) {
      addNotification(err.message, 'ERROR');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('¿Seguro que deseas eliminar este producto del catálogo?')) return;
    try {
      await dataService.deleteInventoryItem(itemId);
      addNotification('Producto eliminado');
      loadData();
    } catch (err) {
      addNotification(err.message, 'ERROR');
    }
  };

  const handleSaveEdit = async () => {
    try {
      await dataService.editInventoryItem(editingItem, editData);
      addNotification('Producto actualizado');
      setEditingItem(null);
      loadData();
    } catch (err) {
      addNotification(err.message, 'ERROR');
    }
  };

  const handleSendRequest = async () => {
    try {
      const itemsList = Object.keys(requestCart)
        .filter(key => requestCart[key] > 0)
        .map(key => {
          const product = inventory.find(i => i.id === key);
          return { product_id: key, product_name: product.name, quantity: requestCart[key] };
        });

      if (itemsList.length === 0) return addNotification('Añade al menos un producto a la solicitud', 'ERROR');

      await dataService.createInventoryRequest(user.id, itemsList, requestNotes);
      addNotification('Solicitud de inventario enviada exitosamente');
      setIsRequesting(false);
      setRequestCart({});
      setRequestNotes('');
      loadData();
    } catch (err) {
      addNotification(err.message, 'ERROR');
    }
  };

  const generateInvoicePDF = (req) => {
    const doc = new jsPDF();
    doc.setFont('helvetica');
    doc.text(`Guía de Despacho Connexo`, 14, 20);
    doc.setFontSize(10);
    doc.text(`ID de Pedido: ${req.id || 'N/A'}`, 14, 30);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 36);
    doc.text(`Distribuidor ID: ${req.distributor_id}`, 14, 42);

    doc.autoTable({
      startY: 50,
      head: [['Producto', 'Cantidad']],
      body: req.items.map(i => [i.product_name, i.quantity])
    });

    if (req.notes) {
      doc.text(`Notas Adicionales: ${req.notes}`, 14, doc.autoTable.previous.finalY + 15);
    }

    doc.save(`despacho_connexo_${req.id || Date.now()}.pdf`);
  };

  const handleStatusChange = async (req, newStatus) => {
    try {
      await dataService.updateRequestStatus(req.id, newStatus);
      addNotification(`Estado actualizado a ${newStatus}`);
      if (newStatus === 'APPROVED') {
        generateInvoicePDF(req);
      }
      loadData(); // Recargar para ver stock deducido
    } catch (err) {
      addNotification(err.message, 'ERROR');
    }
  };

  const filteredRequests = requests.filter(req => {
    if (filterStatus !== 'ALL' && req.status !== filterStatus) return false;
    
    if (isSuperAdmin && filterText) {
      const distributor = team?.find(t => t.id === req.distributor_id);
      const distName = (distributor?.full_name || distributor?.name || `Distribuidor ${req.distributor_id}`).toLowerCase();
      if (!distName.includes(filterText.toLowerCase()) && !req.id.toString().toLowerCase().includes(filterText.toLowerCase())) {
        return false;
      }
    }
    return true;
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>Cargando inventario...</div>;

  return (
    <div className="slide-up" style={{ padding: '0 1.5rem 100px', fontFamily: 'var(--font-main)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.4rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
          {isSuperAdmin ? 'Gestión de Inventario' : 'Solicitud de Material'}
        </h2>
        {isSuperAdmin && (
          <button onClick={() => setIsAddingNew(!isAddingNew)} className="btn btn-primary" style={{ padding: '8px 12px', fontSize: '0.8rem' }}>
            <Plus size={16} /> NUEVO PRODUCTO
          </button>
        )}
      </div>

      {isAddingNew && isSuperAdmin && (
        <motion.form 
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} 
          onSubmit={handleAddNewItem} 
          className="card glass" style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--accent)' }}
        >
          <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--accent)', margin: 0 }}>Añadir al Catálogo</h3>
          <input required placeholder="Nombre del Producto" value={newItemData.name} onChange={e => setNewItemData({...newItemData, name: e.target.value})} style={inputStyle} />
          <input placeholder="Descripción (opcional)" value={newItemData.description} onChange={e => setNewItemData({...newItemData, description: e.target.value})} style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <select value={newItemData.category} onChange={e => setNewItemData({...newItemData, category: e.target.value})} style={inputStyle}>
              <option value="NFC">Tecnología NFC</option>
              <option value="PACKAGING">Empaques / Cajas</option>
              <option value="MERCH">Merchandising</option>
            </select>
            <input required type="number" placeholder="Stock Inicial" value={newItemData.stock_quantity || ''} onChange={e => setNewItemData({...newItemData, stock_quantity: e.target.value})} style={inputStyle} />
          </div>
          <input placeholder="Detalle Empaque (ej. Caja de 100u)" value={newItemData.detail_packaging} onChange={e => setNewItemData({...newItemData, detail_packaging: e.target.value})} style={inputStyle} />
          <button type="submit" className="btn btn-primary">Guardar Producto</button>
        </motion.form>
      )}

      {/* INVENTORY LIST */}
      <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', opacity: 0.6, letterSpacing: '1px', marginBottom: '1rem' }}>Disponibilidad en Bodega</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '3rem' }}>
        {inventory.map(item => {
          const isEditing = editingItem === item.id;
          
          return (
            <div key={item.id} className="card glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1rem 1.25rem', border: isEditing ? '1px solid var(--accent)' : '' }}>
              <div style={{ flex: 1, paddingRight: '10px' }}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} style={{...inputStyle, padding: '8px'}} />
                    <input value={editData.description} onChange={e => setEditData({...editData, description: e.target.value})} style={{...inputStyle, padding: '8px', fontSize: '0.8rem'}} placeholder="Descripción" />
                    <input value={editData.detail_packaging} onChange={e => setEditData({...editData, detail_packaging: e.target.value})} style={{...inputStyle, padding: '8px', fontSize: '0.8rem'}} placeholder="Detalle Empaque" />
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.6rem', padding: '2px 8px', borderRadius: '100px', background: 'rgba(255,102,0,0.1)', color: 'var(--accent)', fontWeight: 'bold' }}>
                        {item.category}
                      </span>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: 'white' }}>{item.name}</p>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '0.7rem', opacity: 0.6 }}>{item.detail_packaging || item.description || 'Unidad estándar'}</p>
                  </>
                )}
                
                {!isSuperAdmin && isRequesting && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
                    <button type="button" onClick={() => setRequestCart(prev => ({...prev, [item.id]: Math.max(0, (prev[item.id] || 0) - 1)}))} style={qtyBtnStyle}>-</button>
                    <span style={{ fontWeight: 'bold', width: '30px', textAlign: 'center' }}>{requestCart[item.id] || 0}</span>
                    <button type="button" onClick={() => setRequestCart(prev => ({...prev, [item.id]: (prev[item.id] || 0) + 1}))} style={qtyBtnStyle}>+</button>
                  </div>
                )}

                {isSuperAdmin && !isEditing && (
                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                    <button onClick={() => { setEditingItem(item.id); setEditData(item); }} style={{...qtyBtnStyle, width: 'auto', padding: '0 8px', fontSize: '0.7rem'}}>
                      <Edit size={12} style={{marginRight: '4px'}}/> Editar
                    </button>
                    <button onClick={() => handleDeleteItem(item.id)} style={{...qtyBtnStyle, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', width: 'auto', padding: '0 8px', fontSize: '0.7rem'}}>
                      <Trash2 size={12} style={{marginRight: '4px'}}/> Borrar
                    </button>
                  </div>
                )}
                {isSuperAdmin && isEditing && (
                  <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                    <button onClick={handleSaveEdit} className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '0.7rem' }}>
                      <Save size={12} style={{marginRight: '4px'}}/> Guardar
                    </button>
                    <button onClick={() => setEditingItem(null)} className="btn glass" style={{ padding: '4px 12px', fontSize: '0.7rem' }}>
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
              
              <div style={{ textAlign: 'right', minWidth: '80px' }}>
                {isSuperAdmin ? (
                  <>
                    <p style={{ margin: '0 0 4px', fontSize: '0.6rem', textTransform: 'uppercase', opacity: 0.6 }}>Stock</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                      <input 
                        type="number" 
                        value={isEditing ? editData.stock_quantity : item.stock_quantity}
                        onChange={(e) => {
                          if (isEditing) setEditData({...editData, stock_quantity: e.target.value});
                        }}
                        disabled={!isEditing}
                        style={{
                          ...inputStyle, 
                          width: '70px', 
                          padding: '6px', 
                          textAlign: 'center', 
                          fontSize: '1.2rem',
                          fontWeight: 'bold',
                          color: (isEditing ? editData.stock_quantity : item.stock_quantity) > 50 ? 'var(--success)' : 'var(--danger)',
                          opacity: isEditing ? 1 : 0.8,
                          cursor: isEditing ? 'text' : 'default'
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p style={{ fontSize: '0.75rem', color: item.stock_quantity > 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {item.stock_quantity > 0 ? 'Disponible' : 'Agotado'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* DISTRIBUTOR REQUEST CONTROLS */}
      {!isSuperAdmin && (
        <div style={{ position: 'fixed', bottom: '85px', left: 0, right: 0, padding: '0 1.5rem', zIndex: 10 }}>
          {isRequesting ? (
             <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="card glass" style={{ border: '1px solid var(--accent)' }}>
               <textarea 
                  placeholder="Notas para el administrador (ej. Enviar a oficina central)" 
                  value={requestNotes} onChange={e => setRequestNotes(e.target.value)}
                  style={{...inputStyle, minHeight: '60px', marginBottom: '10px'}}
               />
               <div style={{ display: 'flex', gap: '10px' }}>
                 <button onClick={() => setIsRequesting(false)} className="btn glass" style={{ flex: 1 }}>Cancelar</button>
                 <button onClick={handleSendRequest} className="btn btn-primary" style={{ flex: 2 }}>
                   <Send size={16} /> Enviar Pedido
                 </button>
               </div>
             </motion.div>
          ) : (
            <button onClick={() => setIsRequesting(true)} className="btn btn-primary" style={{ width: '100%', boxShadow: '0 10px 30px rgba(255,102,0,0.3)' }}>
              <Package size={18} /> Solicitar Material NFC
            </button>
          )}
        </div>
      )}

      {/* REQUESTS HISTORY */}
      <div style={{ marginTop: '3rem' }}>
        <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', opacity: 0.6, letterSpacing: '1px', marginBottom: '1rem' }}>
          {isSuperAdmin ? 'Pedidos Entrantes' : 'Historial de Pedidos'}
        </h3>
        
        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexDirection: isSuperAdmin ? 'row' : 'column' }}>
          <select 
            value={filterStatus} 
            onChange={e => setFilterStatus(e.target.value)} 
            style={{...inputStyle, flex: 1, padding: '8px'}}
          >
            <option value="ALL">Todos los Estados</option>
            <option value="PENDING">Pendientes</option>
            <option value="APPROVED">Aprobados</option>
            <option value="REJECTED">Rechazados</option>
          </select>
          
          {isSuperAdmin && (
            <input 
              type="text" 
              placeholder="Buscar por Nombre del Distribuidor o ID" 
              value={filterText} 
              onChange={e => setFilterText(e.target.value)} 
              style={{...inputStyle, flex: 2, padding: '8px'}}
            />
          )}
        </div>
        
        {filteredRequests.length === 0 ? (
          <p style={{ textAlign: 'center', opacity: 0.4, fontSize: '0.8rem', padding: '2rem' }}>No hay solicitudes de inventario que coincidan con la búsqueda.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredRequests.map(req => {
              const distributor = team?.find(t => t.id === req.distributor_id);
              const distName = distributor?.full_name || distributor?.name || `Distribuidor ${req.distributor_id?.substring(0, 5)}`;
              
              return (
              <div key={req.id} className="card glass" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    <span style={{ 
                      fontSize: '0.65rem', fontWeight: 'bold', padding: '2px 8px', borderRadius: '100px',
                      background: req.status === 'PENDING' ? 'rgba(245,158,11,0.2)' : req.status === 'APPROVED' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                      color: req.status === 'PENDING' ? '#f59e0b' : req.status === 'APPROVED' ? 'var(--success)' : 'var(--danger)'
                    }}>
                      {req.status}
                    </span>
                    <p style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '4px', margin: '4px 0 0' }}>
                      {new Date(req.created_at).toLocaleString()}
                    </p>
                    {isSuperAdmin && (
                      <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent)', margin: '4px 0 0' }}>
                        👤 {distName}
                      </p>
                    )}
                  </div>
                  {isSuperAdmin && req.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleStatusChange(req, 'REJECTED')} style={{...qtyBtnStyle, background: 'rgba(239,68,68,0.2)', color: 'var(--danger)', width: 'auto', padding: '0 10px'}}>Rechazar</button>
                      <button onClick={() => handleStatusChange(req, 'APPROVED')} style={{...qtyBtnStyle, background: 'rgba(16,185,129,0.2)', color: 'var(--success)', width: 'auto', padding: '0 10px'}}>Aprobar y Descontar</button>
                    </div>
                  )}
                </div>
                
                <div style={{ padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  {req.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <span>{item.quantity}x {item.product_name}</span>
                    </div>
                  ))}
                </div>
                {req.notes && <p style={{ fontSize: '0.75rem', marginTop: '8px', opacity: 0.8 }}><em>Nota: {req.notes}</em></p>}
              </div>
            )})}
          </div>
        )}
      </div>

    </div>
  );
};

// Reusable inline styles
const inputStyle = {
  width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', 
  color: 'white', borderRadius: '8px', fontSize: '0.9rem', outline: 'none'
};

const qtyBtnStyle = {
  width: '28px', height: '28px', borderRadius: '6px', border: 'none', 
  background: 'rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer', fontWeight: 'bold'
};

export default InventoryManager;
