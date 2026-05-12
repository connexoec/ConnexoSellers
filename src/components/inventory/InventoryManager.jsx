import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Package, Plus, Minus, Send, Download, Trash2, Edit, Save, X, CreditCard, Box, Shirt, Tag, DollarSign } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dataService } from '../../services/dataService';
import ConnexoLogo from '../../assets/CONNEXO LOGO.png';

const InventoryManager = ({ user, team, metrics, addNotification, selectedSedeContext = 'GLOBAL' }) => {
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  
  const [inventory, setInventory] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // States for Admin Adding Items
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItemData, setNewItemData] = useState({ name: '', description: '', category: 'NFC', stock_quantity: 0, unit_type: 'UNIDAD', detail_packaging: '', price: 0 });
  
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
  
  const isDistributor = user?.role === 'DISTRIBUTOR';
  const [distributorTab, setDistributorTab] = useState('CATALOG'); // 'CATALOG' | 'INVESTMENT'
  const [selectedLevelDetail, setSelectedLevelDetail] = useState(null);

  useEffect(() => {
    loadData();
  }, [user, selectedSedeContext]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const inv = await dataService.getInventory(selectedSedeContext);
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
      const activeSedeId = selectedSedeContext === 'Venezuela' ? 'sede-ve-1' : 'sede-ec-1';
      await dataService.addInventoryItem({ ...newItemData, sede_id: activeSedeId });
      addNotification('Producto añadido al inventario');
      setIsAddingNew(false);
      setNewItemData({ name: '', description: '', category: 'NFC', stock_quantity: 0, unit_type: 'UNIDAD', detail_packaging: '', price: 0 });
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

  const handleOrderPlan = (planData) => {
    const licenseId = selectedSedeContext === 'Venezuela' ? 'inv-ve-plan' : 'inv-ec-plan';
    const quantity = planData.label === 'DISTRIBUIDOR 1' ? 100 
                   : planData.label === 'DISTRIBUIDOR 2' ? 200 
                   : 300;

    // Pre-cargar el carrito con las licencias del plan seleccionado
    setRequestCart({
      [licenseId]: quantity
    });

    setSelectedLevelDetail(null);
    setDistributorTab('CATALOG');
    setIsRequesting(true);

    addNotification(`🚀 Plan de Inversión añadido: ${quantity} Licencias listas para procesar.`);
  };

  const handleSendRequest = async () => {
    try {
      const itemsList = Object.keys(requestCart)
        .filter(key => requestCart[key] > 0)
        .map(key => {
          const product = inventory.find(item => item.id === key);
          return { 
            product_id: key, 
            product_name: product.name, 
            quantity: requestCart[key],
            price: product.price || 0 
          };
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

    autoTable(doc, {
      startY: 50,
      head: [['Producto', 'Cantidad', 'Precio Unit.', 'Total']],
      body: req.items.map(i => {
        const liveProd = inventory.find(p => p.id === i.product_id);
        const cost = i.price || liveProd?.price || 0;
        return [i.product_name, i.quantity, `$${cost.toFixed(2)}`, `$${(cost * i.quantity).toFixed(2)}`];
      })
    });

    const totalOrder = req.items.reduce((a, b) => {
      const liveProd = inventory.find(p => p.id === b.product_id);
      return a + ((b.price || liveProd?.price || 0) * b.quantity);
    }, 0);
    doc.text(`Monto Total Estimado: $${totalOrder.toFixed(2)}`, 14, doc.lastAutoTable.finalY + 10);

    if (req.notes) {
      doc.text(`Notas Adicionales: ${req.notes}`, 14, doc.lastAutoTable.finalY + 20);
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
      {isDistributor && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '2rem', background: 'rgba(255,255,255,0.03)', padding: '6px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <button 
            onClick={() => setDistributorTab('CATALOG')}
            style={{
              flex: 1, padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', transition: 'all 0.2s',
              background: distributorTab === 'CATALOG' ? 'var(--accent)' : 'transparent',
              color: distributorTab === 'CATALOG' ? 'var(--bg-primary)' : 'var(--text-secondary)'
            }}
          >
            CATÁLOGO / PEDIDOS
          </button>
          <button 
            onClick={() => setDistributorTab('INVESTMENT')}
            style={{
              flex: 1, padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', transition: 'all 0.2s',
              background: distributorTab === 'INVESTMENT' ? 'var(--accent)' : 'transparent',
              color: distributorTab === 'INVESTMENT' ? 'var(--bg-primary)' : 'var(--text-secondary)'
            }}
          >
            MI INVERSIÓN NFC
          </button>
        </div>
      )}

      {(!isDistributor || distributorTab === 'CATALOG') ? (
        <>
          {isAddingNew && isSuperAdmin && (
            <motion.form 
              initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} 
              onSubmit={handleAddNewItem} 
              className="card glass" style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--accent)' }}
            >
              <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--accent)', margin: 0 }}>Añadir al Catálogo</h3>
              <input required placeholder="Nombre del Producto" value={newItemData.name} onChange={e => setNewItemData({...newItemData, name: e.target.value})} style={inputStyle} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <select value={newItemData.category} onChange={e => setNewItemData({...newItemData, category: e.target.value})} style={inputStyle}>
                  <option value="NFC">Tecnología NFC</option>
                  <option value="PACKAGING">Empaques / Cajas</option>
                  <option value="MERCH">Merchandising</option>
                </select>
                <input required type="number" step="0.01" placeholder="Precio Venta ($)" value={newItemData.price || ''} onChange={e => setNewItemData({...newItemData, price: e.target.value})} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input required type="number" placeholder="Stock Inicial" value={newItemData.stock_quantity || ''} onChange={e => setNewItemData({...newItemData, stock_quantity: e.target.value})} style={inputStyle} />
                <input placeholder="Detalle Empaque (ej. Caja de 100u)" value={newItemData.detail_packaging} onChange={e => setNewItemData({...newItemData, detail_packaging: e.target.value})} style={inputStyle} />
              </div>
              <input placeholder="Descripción Corta" value={newItemData.description} onChange={e => setNewItemData({...newItemData, description: e.target.value})} style={inputStyle} />
              <button type="submit" className="btn btn-primary">Guardar Producto en Sistema</button>
            </motion.form>
          )}

          {/* INVENTORY LIST */}
          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', opacity: 0.6, letterSpacing: '1px', marginBottom: '1rem' }}>Disponibilidad en Bodega</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', 
            gap: '1rem', 
            marginBottom: '3rem' 
          }}>
            {inventory.map(item => {
              const Icon = item.category === 'NFC' ? CreditCard : item.category === 'PACKAGING' ? Box : Shirt;
              
              return (
                <motion.div 
                  key={item.id} 
                  whileHover={{ y: -4 }}
                  className="card glass" 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    padding: '1.25rem', 
                    border: '1px solid rgba(255,255,255,0.05)', 
                    position: 'relative',
                    aspectRatio: '1 / 1.35',
                    justifyContent: 'space-between',
                    overflow: 'hidden'
                  }}
                >
                  {/* Brand Background Logo */}
                  <img 
                    src={ConnexoLogo} 
                    alt="Brand Logo"
                    style={{ 
                      position: 'absolute', 
                      top: '10px', 
                      right: '-20px', 
                      width: '120px',
                      height: 'auto',
                      opacity: 0.06, 
                      pointerEvents: 'none',
                      transform: 'rotate(-15deg)',
                      zIndex: 0
                    }} 
                  />

                  <div style={{ zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(255,102,0,0.1)', color: 'var(--accent)' }}>
                        <Icon size={14} />
                      </div>
                      <span style={{ fontSize: '0.55rem', fontWeight: 'bold', letterSpacing: '1px', opacity: 0.7 }}>{item.category}</span>
                    </div>
                    <h4 style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '0.9rem', color: 'white', lineHeight: '1.2' }}>{item.name}</h4>
                    <p style={{ margin: 0, fontSize: '0.65rem', opacity: 0.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                       {item.detail_packaging || item.description || 'Estándar'}
                    </p>
                  </div>

                  {/* Body: Price & Stock */}
                  <div style={{ zIndex: 1, marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px', marginBottom: '8px' }}>
                      <div>
                         <p style={{ margin: 0, fontSize: '0.55rem', opacity: 0.5 }}>PRECIO</p>
                         <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent)' }}>${Number(item.price || 0).toFixed(2)}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                         <p style={{ margin: 0, fontSize: '0.55rem', opacity: 0.5 }}>STOCK</p>
                         <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem', color: item.stock_quantity > 10 ? 'white' : 'var(--danger)' }}>{item.stock_quantity}</p>
                      </div>
                    </div>

                    {/* Actions Footer inside card */}
                    {!isSuperAdmin && isRequesting ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '4px' }}>
                        <button type="button" onClick={() => setRequestCart(prev => ({...prev, [item.id]: Math.max(0, (prev[item.id] || 0) - 1)}))} style={{...qtyBtnStyle, width: '24px', height: '24px'}}><Minus size={12}/></button>
                        <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>{requestCart[item.id] || 0}</span>
                        <button type="button" onClick={() => setRequestCart(prev => ({...prev, [item.id]: (prev[item.id] || 0) + 1}))} style={{...qtyBtnStyle, width: '24px', height: '24px', background: 'var(--accent)'}}><Plus size={12}/></button>
                      </div>
                    ) : isSuperAdmin ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => { setEditingItem(item.id); setEditData(item); }} className="btn glass" style={{ flex: 1, padding: '6px', fontSize: '0.65rem', height: 'auto' }}>
                          <Edit size={12} style={{marginRight: '4px'}}/> Edit
                        </button>
                        <button onClick={() => handleDeleteItem(item.id)} className="btn" style={{ padding: '6px', fontSize: '0.65rem', height: 'auto', color: 'var(--danger)', background: 'rgba(239,68,68,0.1)' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ) : (
                       <div style={{ fontSize: '0.65rem', color: item.stock_quantity > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600, textAlign: 'center', padding: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)' }}>
                          {item.stock_quantity > 0 ? '✔ EN EXISTENCIA' : '✖ AGOTADO'}
                       </div>
                    )}
                  </div>
                </motion.div>
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
                      {req.items.map((item, idx) => {
                        const liveItem = inventory.find(pi => pi.id === item.product_id);
                        const itemPrice = item.price || liveItem?.price || 0;
                        return (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '2px' }}>
                            <span style={{ opacity: 0.8 }}>{item.quantity}x {item.product_name}</span>
                            <span style={{ fontWeight: 'bold', color: 'var(--accent)' }}>${(itemPrice * item.quantity).toFixed(2)}</span>
                          </div>
                        );
                      })}
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 'bold' }}>
                        <span style={{ opacity: 0.6 }}>Monto Total:</span>
                        <span style={{ color: 'white' }}>
                          ${req.items.reduce((acc, curr) => {
                            const li = inventory.find(pi => pi.id === curr.product_id);
                            return acc + ((curr.price || li?.price || 0) * curr.quantity);
                          }, 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    {req.notes && <p style={{ fontSize: '0.75rem', marginTop: '8px', opacity: 0.8 }}><em>Nota: {req.notes}</em></p>}
                  </div>
                )})}
              </div>
            )}
          </div>
        </>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="card glass" style={{ marginBottom: '2rem', borderLeft: '4px solid var(--accent)' }}>
            <p style={{ fontSize: '0.6rem', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px' }}>Nivel Actual de Distribución</p>
            <h3 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--accent)' }}>{metrics?.level || 'DISTRIBUIDOR 1'}</h3>
            <p style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '8px', lineHeight: '1.5' }}>
              Como Distribuidor Connexo, tu cuenta cuenta con una asignación de planes preferencial. A continuación, haz clic en tu nivel activo para ver el detalle exacto de lo que estás adquiriendo con tu inversión.
            </p>
          </div>

          <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', opacity: 0.6, letterSpacing: '1px', marginBottom: '1rem' }}>Proyección de Inversión por Niveles</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
            {[
              { lvl: 'Nivel 1', units: '100 unidades', inv: '$526.00', label: 'DISTRIBUIDOR 1' },
              { lvl: 'Nivel 2', units: '200 unidades', inv: '$1,052.00', label: 'DISTRIBUIDOR 2' },
              { lvl: 'Nivel 3', units: '300 unidades', inv: '$1,578.00', label: 'DISTRIBUIDOR 3' }
            ].map((dLevel, idx) => {
              const isActive = (metrics?.level || 'DISTRIBUIDOR 1').toUpperCase().includes(dLevel.label);
              return (
                <motion.div 
                  key={idx} 
                  whileHover={isActive ? { scale: 1.01 } : {}}
                  onClick={() => { if (isActive) setSelectedLevelDetail(dLevel); }}
                  className="card glass" 
                  style={{ 
                    border: isActive ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.03)',
                    background: isActive ? 'linear-gradient(135deg, rgba(255,102,0,0.06) 0%, rgba(0,0,0,0.3) 100%)' : 'rgba(0,0,0,0.1)',
                    padding: '1.25rem',
                    position: 'relative',
                    cursor: isActive ? 'pointer' : 'not-allowed',
                    opacity: isActive ? 1 : 0.6,
                    transition: 'all 0.2s'
                  }}
                >
                  {isActive ? (
                    <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '0.55rem', background: 'var(--accent)', color: 'var(--bg-primary)', fontWeight: 900, padding: '2px 8px', borderRadius: '100px', letterSpacing: '0.5px' }}>TU NIVEL ACTIVO</span>
                  ) : (
                    <span style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '0.55rem', opacity: 0.5, fontWeight: 600 }}>🔒 BLOQUEADO</span>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, fontWeight: 'bold', fontSize: '0.95rem', color: isActive ? 'var(--accent)' : '#aaa' }}>{dLevel.lvl}</h4>
                      <p style={{ margin: '4px 0 0', fontSize: '0.7rem', opacity: 0.6 }}>Capacidad Operativa: {dLevel.units}</p>
                      {isActive && (
                        <p style={{ margin: '6px 0 0', fontSize: '0.6rem', color: 'var(--accent)', fontStyle: 'italic' }}>💡 Haz clic para ver el detalle del plan</p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem', color: isActive ? 'white' : '#777' }}>
                        {isActive ? dLevel.inv : '***.**'}
                      </p>
                      {!isActive && (
                        <p style={{ margin: '2px 0 0', fontSize: '0.55rem', opacity: 0.6 }}>Requiere Rango {dLevel.label.split(' ')[1]}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {selectedLevelDetail && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card glass" style={{ maxWidth: '420px', width: '100%', border: '1px solid var(--accent)', position: 'relative', padding: '2rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <span style={{ background: 'rgba(255,102,0,0.1)', color: 'var(--accent)', padding: '4px 12px', borderRadius: '100px', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '1px' }}>DETALLE DE PLAN ACTIVO</span>
              <h3 style={{ margin: '8px 0 4px', fontSize: '1.4rem', color: 'white', fontWeight: 800 }}>{selectedLevelDetail.lvl}</h3>
              <h2 style={{ margin: 0, color: 'var(--accent)', fontSize: '1.8rem', fontWeight: 900 }}>{selectedLevelDetail.inv}</h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', opacity: 0.6 }}>Inversión para {selectedLevelDetail.units}</p>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1.2rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.75rem', letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.8 }}>¿Qué incluye esta inversión?</h4>
              <ul style={{ padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(
                  selectedLevelDetail.label === 'DISTRIBUIDOR 1' ? [
                    '100 Licencias de Activación de Plan NFC Connexo.',
                    'Acceso Directo al Ecosistema de Red para Vendedores.',
                    'Herramientas de Control de Stock Local y Distribución.',
                    'Soporte Técnico de Nivel 1 integrado.',
                    'Acceso Completo a módulos de Connexo Academy.'
                  ] : selectedLevelDetail.label === 'DISTRIBUIDOR 2' ? [
                    '200 Licencias de Activación de Plan NFC Connexo.',
                    'Herramientas Avanzadas para Gestión de Equipos Vendedores.',
                    'Canal de Soporte Técnico Prioritario de Nivel 2.',
                    'Análisis de Métricas de Rendimiento Avanzado de Red.',
                    'Prioridad en Asignación de Leads y Asesoría Operativa.'
                  ] : [
                    '300 Licencias de Activación de Plan NFC Connexo.',
                    'Control Máximo Operativo de Ecosistema Multisede.',
                    'Soporte VIP Directo 24/7 de Alto Rendimiento.',
                    'Asesoría Estratégica Uno a Uno para Crecimiento de Red.',
                    'Acceso Total a Herramientas Pro de Automatización de Nóminas.'
                  ]
                ).map((text, i) => (
                  <li key={i} style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'flex-start', gap: '8px', lineHeight: '1.4' }}>
                    <span style={{ color: 'var(--accent)', fontSize: '0.9rem', marginTop: '-2px' }}>✓</span>
                    <span style={{ color: 'rgba(255,255,255,0.9)' }}>{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button 
              onClick={() => handleOrderPlan(selectedLevelDetail)} 
              className="btn btn-primary" 
              style={{ 
                width: '100%', 
                marginTop: '1.5rem', 
                background: 'linear-gradient(90deg, #e65100, var(--accent))', 
                boxShadow: '0 4px 20px rgba(255,102,0,0.25)',
                fontWeight: 900,
                letterSpacing: '0.5px',
                textTransform: 'uppercase'
              }}
            >
              🚀 SOLICITAR ESTE PLAN AHORA
            </button>

            <button 
              onClick={() => setSelectedLevelDetail(null)} 
              className="btn glass" 
              style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.75rem' }}
            >
              Regresar
            </button>
          </motion.div>
        </div>,
        document.body
      )}

      {editingItem && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card glass" style={{ maxWidth: '400px', width: '100%', border: '1px solid var(--accent)', position: 'relative' }}>
            <h3 style={{ margin: '0 0 1.5rem', fontSize: '1rem', color: 'var(--accent)', textTransform: 'uppercase' }}>Editar Producto</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.65rem', opacity: 0.7, marginBottom: '4px', display: 'block' }}>NOMBRE PRODUCTO</label>
                <input value={editData.name || ''} onChange={e => setEditData({...editData, name: e.target.value})} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.65rem', opacity: 0.7, marginBottom: '4px', display: 'block' }}>PRECIO ($)</label>
                  <input type="number" step="0.01" value={editData.price || ''} onChange={e => setEditData({...editData, price: e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '0.65rem', opacity: 0.7, marginBottom: '4px', display: 'block' }}>STOCK FÍSICO</label>
                  <input type="number" value={editData.stock_quantity || 0} onChange={e => setEditData({...editData, stock_quantity: e.target.value})} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.65rem', opacity: 0.7, marginBottom: '4px', display: 'block' }}>EMPAQUE / DETALLE</label>
                <input value={editData.detail_packaging || ''} onChange={e => setEditData({...editData, detail_packaging: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '0.65rem', opacity: 0.7, marginBottom: '4px', display: 'block' }}>DESCRIPCIÓN</label>
                <textarea value={editData.description || ''} onChange={e => setEditData({...editData, description: e.target.value})} style={{ ...inputStyle, minHeight: '60px' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem' }}>
              <button onClick={() => setEditingItem(null)} className="btn glass" style={{ flex: 1 }}>Cancelar</button>
              <button onClick={handleSaveEdit} className="btn btn-primary" style={{ flex: 2 }}>
                 <Save size={16} /> Guardar Cambios
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
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
