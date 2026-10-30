import {useEffect, useState} from 'react';
import {ArrowRight, Boxes, CircleCheck, ShoppingBasket, TriangleAlert} from 'lucide-react';
import {loadCurrentInventory, type CurrentInventory} from '../../services/inventory';
import FoodImage from '../../shared/ui/FoodImage';

export default function Dashboard({revision, pending, shoppingError, onRetryShopping}: {
  revision: number; pending: number | null; shoppingError: string; onRetryShopping: () => void;
}) {
  const [data, setData] = useState<CurrentInventory | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void loadCurrentInventory().then(result => {
      if (active) {setData(result); setError(''); setLoading(false);}
    }).catch(() => {
      if (active) {setError('Could not load saved inventory. Check your connection and retry.'); setLoading(false);}
    });
    return () => {active = false;};
  }, [revision, retry]);
  const low = data?.items.filter(item => item.stock_status === 'low') ?? [];
  const metrics = [
    {label: 'Inventory ingredients', value: data?.items.length, Icon: Boxes},
    {label: 'Available ingredients', value: data?.items.filter(item => item.stock_status === 'available').length, Icon: CircleCheck},
    {label: 'Running low', value: data ? low.length : undefined, Icon: TriangleAlert},
    {label: 'Pending shopping items', value: pending ?? undefined, Icon: ShoppingBasket},
  ];
  return <section id="dashboard" className="dashboard" aria-label="Dashboard">
    <div className="welcome-card"><div><p className="eyebrow">FROM FRIDGE TO FORK</p><h1>Something delicious<br/>is already in your fridge.</h1><p>Take a photo. Review your ingredients.<br/>Discover your next meal.</p><a href="/scan" className="text-link">Let's see what's inside <ArrowRight size={17} aria-hidden="true"/></a></div><div className="food-art" aria-hidden="true"><div className="plate"><span>&#129361;</span><span>&#129388;</span><span>&#127813;</span></div><span className="art-label">Fresh ideas start here</span></div></div>
    <div className="dashboard-heading"><div><h2>Your kitchen at a glance</h2><p>Current confirmed inventory and your shopping lists.</p></div><a href="/scan" className="button-link">Scan Fridge</a></div>
    {loading && <p role="status">Loading your kitchen...</p>}
    {error && <p role="alert">{error} {data && 'Showing the last loaded inventory.'} <button onClick={() => {setLoading(true); setRetry(value => value + 1);}}>Retry inventory</button></p>}
    {shoppingError && <p role="alert">Shopping counts are unavailable. <button onClick={onRetryShopping}>Retry shopping lists</button></p>}
    <div className="summary-grid" aria-label="Kitchen statistics">{metrics.map(({label, value, Icon}) => <article className="summary-card" key={label} aria-label={label}><Icon className="summary-icon" size={22} aria-hidden="true"/><p>{label}</p><strong>{value ?? '—'}</strong>{value === undefined && <small>Not loaded</small>}</article>)}</div>
    <div className="dashboard-details">
      <section className="panel recent-scan" aria-labelledby="recent-scan-title"><p className="eyebrow">SAVED & CONFIRMED</p><h2 id="recent-scan-title">Recent scan</h2>
        {data?.scan ? <><p><strong>Scan #{data.scan.id}</strong>{data.scan.is_mock && ' · Demo scan'}</p>{data.scan.created_at && <time dateTime={data.scan.created_at}>{new Date(data.scan.created_at).toLocaleString()}</time>}<p>{data.items.length} confirmed ingredients · {low.length} running low.</p><p>Current inventory uses this complete saved snapshot. Earlier scans remain in scan history.</p><a href="/scan" className="text-link">Open saved scans <ArrowRight size={16} aria-hidden="true"/></a></> : <p>{data ? 'No reviewed scan yet. Scan your fridge and confirm the ingredients to get started.' : 'Saved scan details will appear here.'}</p>}
      </section>
      <section className="panel" aria-labelledby="low-stock-title"><p className="eyebrow">PLAN YOUR NEXT SHOP</p><h2 id="low-stock-title">Running low</h2>
        {low.length ? <><ul className="dashboard-low-stock">{low.slice(0, 4).map(item => <li key={item.id}><span>{item.name}</span><span className="low-badge">Running low</span></li>)}</ul><a href="/shopping" className="text-link">Add to a shopping list <ArrowRight size={16} aria-hidden="true"/></a></> : <p>{data ? 'No confirmed low-stock ingredients in your current inventory.' : 'Low-stock suggestions will appear after inventory loads.'}</p>}
      </section>
    </div>
    <section className="panel inventory-preview" aria-labelledby="inventory-preview-title"><div className="inventory-heading"><h2 id="inventory-preview-title">A peek inside your fridge</h2><a href="/inventory" className="text-link">View all ingredients <ArrowRight size={16} aria-hidden="true"/></a></div>
      <p className="inventory-caption">{data ? `${Math.min(6, data.items.length)} of ${data.items.length} current ingredients` : 'Current saved ingredients'} · Reference food photographs. <a href="/foods/credits.html" target="_blank" rel="noreferrer">Photo credits</a></p>
      <div className="preview-grid">{data?.items.slice(0, 6).map(item => <article className="preview-item" key={item.id}><FoodImage name={item.name}/><div><h3>{item.name}</h3><span className={item.stock_status === 'low' ? 'low-badge' : 'stock-badge'}>{item.stock_status === 'low' ? 'Running low' : item.stock_status}</span></div></article>)}</div>
      {data?.items.length === 0 && <p>No ingredients saved yet. <a href="/scan">Scan your fridge</a> or <a href="/inventory">add an ingredient</a>.</p>}
    </section>
  </section>;
}
