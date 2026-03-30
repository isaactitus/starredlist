import React from 'react';

const PET_SHOP_ITEMS = [
  { id: 'party_hat', name: 'Party Hat', type: 'hat', price: 5, icon: '🥳', color: '#ff6b6b' },
  { id: 'top_hat', name: 'Top Hat', type: 'hat', price: 15, icon: '🎩', color: '#333' },
  { id: 'straw_hat', name: 'Summer Hat', type: 'hat', price: 10, icon: '👒', color: '#f1c40f' },
  { id: 'cool_shades', name: 'Cool Shades', type: 'glass', price: 8, icon: '🕶️', color: '#222' },
  { id: 'heart_glasses', name: 'Heart Lens', type: 'glass', price: 12, icon: '👓', color: '#e84393' },
  { id: 'scarf_red', name: 'Red Scarf', type: 'neck', price: 20, icon: '🧣', color: '#d63031' },
];

export const PetRoomModal = ({ 
  coins, 
  setCoins, 
  petItems, 
  setPetItems, 
  activeItems, 
  setActiveItems, 
  onClose,
  accent 
}) => {

  const buyItem = (item) => {
    if (coins >= item.price && !petItems.includes(item.id)) {
      setCoins(c => c - item.price);
      setPetItems(p => [...p, item.id]);
    }
  };

  const toggleEquip = (item) => {
    if (!petItems.includes(item.id)) return;
    
    setActiveItems(prev => ({
      ...prev,
      [item.type]: prev[item.type] === item.id ? null : item.id
    }));
  };

  return (
    <div className="overlay" style={{ zIndex: 3000 }} onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="m-head">
          <div className="m-title">🏠 Neko's Room</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
             <div style={{ color: '#ffd93d', fontWeight: 900, background: 'rgba(255,217,61,0.1)', padding: '4px 10px', borderRadius: 12, fontSize: 13 }}>🪙 {coins}</div>
             <button className="ic-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        
        <div className="m-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 16 }}>
            Earn <b>Taskflow Coins</b> by completing tasks and level up your companion!
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {PET_SHOP_ITEMS.map(item => {
              const owned = petItems.includes(item.id);
              const equipped = activeItems[item.type] === item.id;
              
              return (
                <div 
                  key={item.id}
                  onClick={() => owned ? toggleEquip(item) : buyItem(item)}
                  style={{
                    background: 'var(--s2)',
                    borderRadius: 16,
                    padding: 16,
                    border: equipped ? `2px solid ${accent.v}` : '1.5px solid var(--b1)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative',
                    opacity: (!owned && coins < item.price) ? 0.6 : 1
                  }}
                >
                  <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8 }}>{item.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)', textAlign: 'center' }}>{item.name}</div>
                  
                  <div style={{ marginTop: 8, textAlign: 'center' }}>
                    {owned ? (
                      <span style={{ fontSize: 11, fontWeight: 800, color: equipped ? accent.v : 'var(--t3)' }}>
                        {equipped ? 'EQUIPPED' : 'OWNED'}
                      </span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: '#ffd93d' }}>🪙 {item.price}</span>
                      </div>
                    )}
                  </div>

                  {equipped && (
                    <div style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, background: accent.v }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="m-foot">
          <button className="btn-s" style={{ width: '100%' }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};
