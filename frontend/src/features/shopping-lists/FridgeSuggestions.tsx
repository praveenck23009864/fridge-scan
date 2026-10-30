import {useRef, useState} from 'react';
import {addFridgeSuggestions, type FridgeSuggestionsData, type ShoppingList} from '../../services/api';
import './FridgeSuggestions.css';

export default function FridgeSuggestions({list,data,loading,error,onRefresh,onUpdated}: {
  list: ShoppingList; data: FridgeSuggestionsData | null; loading: boolean; error: string;
  onRefresh: () => void; onUpdated: (list: ShoppingList) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const normalize = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  const existing = new Set(list.items.map(item => normalize(item.name)));
  const items = data?.items ?? [];
  const chosen = selected.filter(id => items.some(item => item.id === id && !existing.has(normalize(item.name))));
  async function addSelected() {
    if (pending.current || loading || error || data?.scan_id == null || chosen.length === 0) return;
    pending.current = true; setBusy(true); setSaveError(''); setNotice('');
    try {
      const result = await addFridgeSuggestions(list.id, data.scan_id, chosen);
      onUpdated(result); setSelected([]); setNotice('Selected fridge suggestions are now in your list.');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Could not add suggestions. Please retry.');
    } finally { pending.current = false; setBusy(false); }
  }
  return <section className="fridge-suggestions" aria-label={`Fridge suggestions for ${list.name}`}>
    <div className="suggestion-heading"><h4>Suggested from your fridge</h4><button type="button" onClick={onRefresh} disabled={busy || loading}>Refresh suggestions</button></div>
    {loading ? <p role="status">Loading fridge suggestions...</p> : error ? <p role="alert">{error}</p> : <>
      {items.length === 0 ? <p>No low-stock ingredients found. Review and save a fridge scan first.</p> : <>
        <p>From {data?.is_mock ? 'DEMO ' : ''}saved scan #{data?.scan_id}. Select items to add to this list.</p>
        <fieldset disabled={busy}><legend className="sr-only">Select saved low-stock ingredients</legend>
          {items.map(item => {
            const alreadyAdded = existing.has(normalize(item.name));
            return <label className="suggestion-option" key={item.id}>
              <input type="checkbox" checked={!alreadyAdded && selected.includes(item.id)} disabled={alreadyAdded}
                onChange={event => {setNotice('');setSelected(previous => event.target.checked ? [...previous,item.id] : previous.filter(id => id !== item.id));}} />
              <span>{item.name}</span><small>{alreadyAdded ? 'Already in list' : 'Running low'}</small>
            </label>;
          })}
        </fieldset>
        <button type="button" onClick={() => void addSelected()} disabled={busy || chosen.length === 0} aria-busy={busy}>
          {busy ? 'Adding suggestions...' : `Add selected suggestions (${chosen.length})`}
        </button>
      </>}
    </>}
    {saveError && <p role="alert">{saveError} Refresh suggestions if your saved scan changed.</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
