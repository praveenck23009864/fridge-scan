import { useEffect, useState } from "react";
import {
  api,
  type AIAnalysisResponse,
  type DetectedItem,
  type FridgeScan,
  type ShoppingList,
  type StockStatus,
} from "../services/api";
import "./ScanReview.css";

type ReviewItem = {
  key: string;
  id?: number;
  name: string;
  stock_status: StockStatus;
  confirmed: boolean;
};

type Props = {
  analysis: AIAnalysisResponse | null;
  disabled?: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onShoppingListCreated: (list: ShoppingList) => void;
};

function savedRows(items: DetectedItem[]): ReviewItem[] {
  return items.map((item) => ({ ...item, key: crypto.randomUUID() }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the request. Please try again.";
}

export default function ScanReview({ analysis, disabled = false, onDirtyChange, onBusyChange, onShoppingListCreated }: Props) {
  const [items, setItems] = useState<ReviewItem[]>(() =>
    (analysis?.items ?? []).map((item) => ({ ...item, key: crypto.randomUUID(), confirmed: false }))
  );
  const [scan, setScan] = useState<FridgeScan | null>(null);
  const [metadata, setMetadata] = useState({
    is_mock: analysis?.is_mock ?? false,
    model_used: analysis?.model_used ?? null,
  });
  const [scans, setScans] = useState<FridgeScan[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(!!analysis);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newName, setNewName] = useState("");
  const [newStatus, setNewStatus] = useState<StockStatus>("unknown");
  const hasUnsaved = dirty || items.some((item) => !item.confirmed) || !!newName.trim();
  const locked = busy || disabled || historyLoading;
  const confirmed = items.filter((item) => item.confirmed);
  const confirmedLow = confirmed.filter((item) => item.stock_status === "low").length;
  const hasReview = !!analysis || !!scan || items.length > 0;

  useEffect(() => { onDirtyChange(hasUnsaved); }, [hasUnsaved, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);

  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const saved = await api.getScans();
        if (!active) return;
        setScans(saved);
        // Reopen the latest saved review after a reload. A fresh analysis wins.
        const latest = saved.find((entry) => entry.status === "reviewed");
        if (!analysis && latest) {
          const rows = await api.getScanItems(latest.id);
          if (!active) return;
          setScan(latest);
          setMetadata({ is_mock: latest.is_mock, model_used: latest.model_used });
          setItems(savedRows(rows));
        }
      } catch (err) {
        if (active) setHistoryError(errorMessage(err));
      } finally {
        if (active) setHistoryLoading(false);
      }
    }
    void restore();
    return () => { active = false; };
  }, [analysis]);

  async function refreshHistory() {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      setScans(await api.getScans());
    } catch (err) {
      setHistoryError(errorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openScan(selected: FridgeScan) {
    if (hasUnsaved && !window.confirm("Discard unsaved review changes and open this saved scan?")) return;
    setBusy(true);
    setError("");
    try {
      const rows = await api.getScanItems(selected.id);
      setScan(selected);
      setMetadata({ is_mock: selected.is_mock, model_used: selected.model_used });
      setItems(savedRows(rows));
      setDirty(false);
      setNewName("");
      setNotice(`Loaded saved scan #${selected.id}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function editItem(key: string, change: Partial<ReviewItem>) {
    setItems((previous) => previous.map((item) => item.key === key ? { ...item, ...change } : item));
    setDirty(true);
    setNotice("");
    setError("");
  }

  function addItem() {
    const name = newName.trim();
    if (!name) return;
    setItems((previous) => [...previous, { key: crypto.randomUUID(), name, stock_status: newStatus, confirmed: false }]);
    setNewName("");
    setNewStatus("unknown");
    setDirty(true);
    setNotice("");
  }

  async function save() {
    if (confirmed.some((item) => !item.name.trim())) {
      setError("Enter a food name for every confirmed item.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Retain a newly allocated scan ID if saving fails, so retry uses it.
      const current = scan ?? await api.createScan(metadata);
      setScan(current);
      const saved = await api.saveReview(current.id, confirmed.map((item) => ({
        id: item.id, name: item.name.trim(), stock_status: item.stock_status, confirmed: true,
      })));
      let index = 0;
      setItems(items.map((item) => item.confirmed
        ? { ...item, ...saved[index++] }
        : { ...item, id: undefined }));
      const updated = { ...current, status: "reviewed" };
      setScan(updated);
      setScans((previous) => [updated, ...previous.filter((entry) => entry.id !== current.id)].sort((a, b) => b.id - a.id));
      setDirty(false);
      const remaining = items.length - saved.length;
      setNotice(`Saved ${saved.length} confirmed item(s).${remaining ? ` ${remaining} unchecked item(s) remain unsaved drafts.` : " You can safely reload."}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function createShoppingList() {
    if (!scan || dirty) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const list = await api.saveScanToList(scan.id);
      onShoppingListCreated(list);
      setNotice(`Shopping list "${list.name}" is ready below.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel scan-review" aria-labelledby="review-title">
      <h2 id="review-title">Review food items</h2>
      <p>Correct the detections, confirm each item, then save your review.</p>
      {historyLoading && <p role="status">Loading saved scans…</p>}
      {historyError && <p role="alert" className="error">{historyError}</p>}
      <details className="scan-history">
        <summary>Saved scans ({scans.length})</summary>
        <button type="button" disabled={locked} onClick={() => void refreshHistory()}>Refresh saved scans</button>
        {scans.length === 0 && !historyLoading && <p>No scans saved yet.</p>}
        <ul>
          {scans.map((entry) => (
            <li key={entry.id}>
              <button type="button" disabled={locked} onClick={() => void openScan(entry)}>
                {entry.is_mock ? "DEMO · " : ""}Scan #{entry.id} · {entry.status}
                {entry.created_at ? ` · ${new Date(entry.created_at).toLocaleString()}` : ""}
              </button>
            </li>
          ))}
        </ul>
      </details>

      {hasReview ? (
        <>
          {metadata.is_mock && (
            <p className="mock-banner" role="note"><strong>Development mock results.</strong> These are sample foods, not AI observations of your photos. Saved scans and shopping lists stay labeled DEMO.</p>
          )}
          <p className="review-source">
            {scan ? `Scan #${scan.id}` : "New review"} · {metadata.is_mock ? "DEMO" : "AI recognition"}
            {metadata.model_used && ` · ${metadata.model_used}`}
          </p>
          <p>Only confirmed items are kept in the saved scan. Unchecked items remain unsaved drafts. Editing a name or stock status requires confirmation again.</p>
          <fieldset disabled={locked} className="review-fields">
            <legend className="sr-only">Review detected food</legend>
            {items.map((item, index) => (
              <div className="review-row" key={item.key}>
                <label>Food name {index + 1}
                  <input value={item.name} maxLength={100} onChange={(event) => editItem(item.key, { name: event.target.value, confirmed: false })} />
                </label>
                <label>Stock status {index + 1}
                  <select value={item.stock_status} onChange={(event) => editItem(item.key, { stock_status: event.target.value as StockStatus, confirmed: false })}>
                    <option value="low">Low</option><option value="available">Available</option><option value="unknown">Unknown</option>
                  </select>
                </label>
                <label className="confirm-item">
                  <input type="checkbox" checked={item.confirmed} disabled={!item.name.trim()} onChange={(event) => editItem(item.key, { confirmed: event.target.checked })} />
                  Confirm item {index + 1}
                </label>
                <button type="button" className="danger" aria-label={`Delete item ${index + 1}`} onClick={() => {
                  setItems((previous) => previous.filter((row) => row.key !== item.key));
                  setDirty(true); setNotice("");
                }}>Delete</button>
              </div>
            ))}
            {items.length === 0 && <p>No items in this review. Add a missing food below.</p>}
            <form onSubmit={(event) => { event.preventDefault(); addItem(); }} className="add-review-item">
              <label>Missing food name<input value={newName} maxLength={100} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Tomatoes" /></label>
              <label>Missing food stock status
                <select value={newStatus} onChange={(event) => setNewStatus(event.target.value as StockStatus)}>
                  <option value="unknown">Unknown</option><option value="available">Available</option><option value="low">Low</option>
                </select>
              </label>
              <button type="submit" disabled={!newName.trim() || items.length >= 200}>Add missing item</button>
            </form>
            <p>{confirmed.length} of {items.length} items confirmed · {confirmedLow} low-stock</p>
            <div className="review-actions">
              <button type="button" disabled={!dirty || (!scan && confirmed.length === 0)} onClick={() => void save()}>Save confirmed items</button>
              <button type="button" disabled={!scan || dirty || confirmedLow === 0} onClick={() => void createShoppingList()}>Create shopping list from low-stock items</button>
            </div>
          </fieldset>
          <p className="review-hint">Save before creating a list. Each scan creates one shopping list snapshot; later review edits do not overwrite that list. You can edit the list below.</p>
        </>
      ) : <p>Analyze fridge photos to start a review, or open a saved scan.</p>}
      {busy && <p role="status">Saving or loading your review…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status" className="review-notice">{notice}</p>}
    </section>
  );
}
