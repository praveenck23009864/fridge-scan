import {Fragment, useEffect, useRef, useState} from 'react';
import {Pencil, Plus, Trash2} from 'lucide-react';
import {categories} from '../../shared/types/categories';
import FoodImage from '../../shared/ui/FoodImage';
import {loadCurrentInventory, type CurrentInventory} from '../../services/inventory';
import {api, type DetectedItem, type StockStatus} from '../../services/api';

type Draft = {id?: number; name: string; stock_status: StockStatus; category: string};
type Props = {revision: number; onChanged?: () => void; locked?: boolean};

function InventoryEditor({draft, busy, locked, error, onChange, onSave, onCancel}: {
  draft: Draft; busy: boolean; locked: boolean; error: string;
  onChange: (draft: Draft) => void; onSave: () => void; onCancel: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus({preventScroll: true});
    form.current?.scrollIntoView?.({block: 'nearest'});
  }, []);
  return <form ref={form} className="inventory-editor" aria-label={draft.id ? 'Edit ingredient' : 'New ingredient'}
    onSubmit={event => {event.preventDefault(); onSave();}}
    onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing && !busy && !(event.target instanceof HTMLSelectElement)) {
        event.preventDefault(); event.stopPropagation(); onCancel();
      }
    }}>
    <fieldset disabled={busy || locked}>
      <legend>{draft.id ? 'Edit ingredient' : 'New ingredient'}</legend>
      <div className="inventory-editor-fields">
        <label>Ingredient name<input ref={input} required maxLength={100} value={draft.name} onChange={e => onChange({...draft, name: e.target.value})}/></label>
        <label>Ingredient stock<select value={draft.stock_status} onChange={e => onChange({...draft, stock_status: e.target.value as StockStatus})}>
          {['available','low','unknown'].map(value => <option key={value}>{value}</option>)}
        </select></label>
        <label>Ingredient category<select value={draft.category} onChange={e => onChange({...draft, category: e.target.value})}>
          {categories.map(value => <option key={value}>{value}</option>)}
        </select></label>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="inventory-editor-actions">
        <button type="submit" aria-label="Save ingredient" disabled={!draft.name.trim()}>{busy ? 'Saving...' : 'Save'}</button>
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}

export default function Inventory({revision, onChanged, locked = false}: Props) {
  const [data, setData] = useState<CurrentInventory | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState('cards');
  const [category, setCategory] = useState('all');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const trigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let active = true;
    loadCurrentInventory().then(result => {
      if (active) {setData(result); setError('');}
    }).catch(() => {if (active) setError('Could not load saved inventory. Refresh the page to retry.');});
    return () => {active = false;};
  }, [revision]);

  async function persist(items: DetectedItem[]) {
    if (saving.current || locked) return;
    saving.current = true; setBusy(true); setError('');
    try {
      // Keep the existing reviewed-snapshot workflow and preserve scan history.
      const scan = await api.createScan({is_mock: data?.scan?.is_mock ?? false, model_used: data?.scan?.model_used ?? null});
      const saved = await api.saveReview(scan.id, items.map(item => ({name: item.name, stock_status: item.stock_status, category: item.category || 'Other', confirmed: true})));
      setData({scan: {...scan, status: 'reviewed'}, items: saved}); setDraft(null); onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save inventory. Retry.');
    } finally {saving.current = false; setBusy(false);}
  }

  function cancel() {if (!saving.current) {setDraft(null); setError(''); trigger.current?.focus();}}
  function openEditor(value: Draft, button: HTMLButtonElement) {
    trigger.current = button; setError(''); setDraft(value);
  }
  function saveDraft() {
    if (!draft || !data || !draft.name.trim()) return;
    const item = {...draft, name: draft.name.trim(), id: draft.id ?? -1, scan_id: data.scan?.id ?? 0, confirmed: true};
    void persist(draft.id ? data.items.map(row => row.id === draft.id ? item : row) : [...data.items, item]);
  }
  const editor = draft && <InventoryEditor key={draft.id ?? 'new'} draft={draft} busy={busy} locked={locked} error={error} onChange={setDraft} onSave={saveDraft} onCancel={cancel}/>;
  const actions = (item: DetectedItem) => <div className="inventory-actions">
    <button className="icon-button" type="button" aria-label={`Edit ${item.name}`} title={`Edit ${item.name}`} aria-expanded={draft?.id === item.id}
      disabled={busy || locked} onClick={e => openEditor({...item, category: item.category || 'Other'}, e.currentTarget)}><Pencil size={17} aria-hidden="true"/></button>
    <button className="icon-button danger" type="button" aria-label={`Delete ${item.name}`} title={`Delete ${item.name}`} disabled={busy || locked}
      onClick={() => {if (window.confirm(`Delete ${item.name} from current inventory? Previous scans will be retained.`)) {setDraft(null); void persist(data!.items.filter(row => row.id !== item.id));}}}><Trash2 size={17} aria-hidden="true"/></button>
  </div>;
  if (!data) return <p role={error ? 'alert' : 'status'}>{error || 'Loading saved inventory...'}</p>;
  const filtered = data.items.filter(item => item.name.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || item.stock_status === status) && (category === 'all' || (item.category || 'Other') === category));
  const stock = (item: DetectedItem) => <span className={item.stock_status === 'low' ? 'low-badge' : 'stock-badge'}>{item.stock_status === 'low' ? 'Running low' : item.stock_status}</span>;
  return <>
    <section id="inventory" className="panel inventory-panel" aria-label="My inventory">
      <div className="inventory-heading"><h1>My Inventory</h1><button className="compact-button" disabled={busy || locked} onClick={e => openEditor({name: '', stock_status: 'unknown', category: 'Other'}, e.currentTarget)}><Plus size={17} aria-hidden="true"/>Add ingredient</button></div>
      <p className="inventory-caption">Current inventory: all confirmed ingredients from the latest reviewed scan. Earlier scans are history, not additional stock. Reference food photos, not your fridge. <a href="/foods/credits.html" target="_blank" rel="noreferrer">Photo credits and licenses</a></p>
      <p className="inventory-source">{data.scan ? `Source: scan #${data.scan.id}${data.scan.created_at ? ' ? ' + new Date(data.scan.created_at).toLocaleString() : ''}. ` : ''}<a href="/scan">View scan history</a></p>
      <div className="inventory-toolbar">
        <label>Search food<input value={search} onChange={e => setSearch(e.target.value)}/></label>
        <label>Stock status<select value={status} onChange={e => setStatus(e.target.value)}>{['all','available','low','unknown'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Category filter<select value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
        <button className="secondary-button" onClick={() => setView(view === 'cards' ? 'table' : 'cards')}>Switch to {view === 'cards' ? 'table' : 'cards'} view</button>
      </div>
      {!draft && error && <p role="alert">{error}</p>}
      {locked && <p>Save or discard your scan review before editing inventory.</p>}
      {draft && !draft.id && editor}
      {!data.scan && <p>No saved inventory. Add an ingredient or review and save a scan first.</p>}
      <p className="inventory-count" role="status">Showing {filtered.length} of {data.items.length} current ingredients</p>
      {filtered.length === 0 && <p>No ingredients match these filters.</p>}
      {draft?.id && !filtered.some(item => item.id === draft.id) && <p role="status">The ingredient being edited is hidden by your filters. Clear the filters to continue editing or <button className="secondary-button" onClick={cancel}>Cancel editing</button>.</p>}
      {view === 'cards' ? <div className="inventory-cards">{filtered.map(item => <article className="inventory-item" key={item.id}>
        <div className="inventory-card-overview"><FoodImage name={item.name}/><div><h3>{item.name}</h3>{stock(item)}<p>{item.category || 'Other'}</p><small>Source scan #{item.scan_id}</small></div></div>
        {actions(item)}{draft?.id === item.id && editor}
      </article>)}</div> : <div className="table-scroll" role="region" aria-label="Inventory table scroll area" tabIndex={0}><table><caption className="sr-only">Confirmed inventory</caption><thead><tr>{['Photo','Food','Stock','Category','Source','Actions'].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
        <tbody>{filtered.map(item => <Fragment key={item.id}><tr><td><FoodImage name={item.name}/></td><td>{item.name}</td><td>{stock(item)}</td><td>{item.category || 'Other'}</td><td>Scan #{item.scan_id}</td><td>{actions(item)}</td></tr>
          {draft?.id === item.id && <tr className="inventory-edit-row"><td colSpan={6}>{editor}</td></tr>}
        </Fragment>)}</tbody></table></div>}
    </section>
  </>;
}
