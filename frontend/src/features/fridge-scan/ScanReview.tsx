
import { useEffect, useRef, useState } from "react";

import {
  api,
  type AIAnalysisResponse,
  type DetectedItem,
  type FridgeScan,
  type ShoppingList,
  type StockStatus,
} from "../../services/api";

import "./ScanReview.css";

type ReviewItem = {
  key: string;
  id?: number;
  name: string;
  stock_status: StockStatus;
};

type Props = {
  analysis: AIAnalysisResponse | null;
  disabled?: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onShoppingListCreated: (list: ShoppingList) => void;
  onSummaryChange?: (summary: {
    scans: number;
    ingredients: number;
    low: number;
  }) => void;
  onSavedScanChange?: () => void;
  onReviewSaved?: (scanId: number | null) => void;
};

function makeRows(
  items: Array<{
    id?: number;
    name: string;
    stock_status: StockStatus;
  }>
): ReviewItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    stock_status: item.stock_status,
    key: crypto.randomUUID(),
  }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function ScanReview({
  analysis,
  disabled = false,
  onDirtyChange,
  onBusyChange,
  onShoppingListCreated,
  onSummaryChange,
  onSavedScanChange,
  onReviewSaved,
}: Props) {
  const [items, setItems] = useState<ReviewItem[]>(
    () => makeRows(analysis?.items ?? [])
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

  // Prevent duplicate submissions while a review is being persisted.
  const saving = useRef(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [newName, setNewName] = useState("");
  const [newStatus, setNewStatus] =
    useState<StockStatus>("unknown");

  const hasUnsaved = dirty || !!newName.trim();
  const locked = busy || disabled || historyLoading;

  const lowStockCount = items.filter(
    (item) => item.stock_status === "low"
  ).length;

  const hasReview =
    !!analysis || !!scan || items.length > 0;

  const hasInvalidNames = items.some(
    (item) => !item.name.trim()
  );

const canSave =
  !locked &&
  hasReview &&
  !hasInvalidNames &&
  !newName.trim();

  // Update the dashboard counters.
  useEffect(() => {
    onSummaryChange?.({
      scans: scans.length,
      ingredients: items.length,
      low: lowStockCount,
    });
  }, [
    scans.length,
    items,
    lowStockCount,
    onSummaryChange,
  ]);

  // Notify App.tsx about unsaved changes.
  useEffect(() => {
    onDirtyChange(hasUnsaved);
  }, [hasUnsaved, onDirtyChange]);

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!hasUnsaved) return;

    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warn);

    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [hasUnsaved]);

  // Load saved scan history on mount.
  useEffect(() => {
    let active = true;

    async function restore() {
      setHistoryLoading(true);

      try {
        const saved = await api.getScans();

        if (!active) return;

        setScans(saved);

        const latest = saved.find(
          (entry) => entry.status === "reviewed"
        );

        // Do not replace a new AI analysis.
        if (!analysis && latest) {
          const rows = await api.getScanItems(latest.id);

          if (!active) return;

          setScan(latest);

          setMetadata({
            is_mock: latest.is_mock,
            model_used: latest.model_used,
          });

          setItems(makeRows(rows));
          setDirty(false);

          onSavedScanChange?.();

          onReviewSaved?.(
            rows.length > 0 ? latest.id : null
          );
        }
      } catch (err) {
        if (active) {
          setHistoryError(errorMessage(err));
        }
      } finally {
        if (active) {
          setHistoryLoading(false);
        }
      }
    }

    void restore();

    return () => {
      active = false;
    };

    // Preserve the existing scan-history restore behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  // App remounts this component for each new analysis; initializers own draft state.

  async function refreshHistory() {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const saved = await api.getScans();
      setScans(saved);
    } catch (err) {
      setHistoryError(errorMessage(err));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openScan(selected: FridgeScan) {
    if (
      hasUnsaved &&
      !window.confirm(
        "Discard unsaved changes and open this saved scan?"
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const rows: DetectedItem[] =
        await api.getScanItems(selected.id);

      setScan(selected);
      setItems(makeRows(rows));

      setMetadata({
        is_mock: selected.is_mock,
        model_used: selected.model_used,
      });

      setDirty(false);
      setNewName("");
      setNewStatus("unknown");

      onSavedScanChange?.();

      if (
        selected.status === "reviewed" &&
        rows.length > 0
      ) {
        onReviewSaved?.(selected.id);
      } else {
        onReviewSaved?.(null);
      }

      setNotice(`Loaded saved scan #${selected.id}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Every ingredient change resets final confirmation.
  function markChanged() {
    setDirty(true);
    onReviewSaved?.(null);
    setError("");
    setNotice("");
  }

  function editItem(
    key: string,
    change: Partial<ReviewItem>
  ) {
    setItems((previous) =>
      previous.map((item) =>
        item.key === key
          ? { ...item, ...change }
          : item
      )
    );

    markChanged();
  }

  function addItem() {
    const name = newName.trim();

    if (!name || items.length >= 200) return;

    setItems((previous) => [
      ...previous,
      {
        key: crypto.randomUUID(),
        name,
        stock_status: newStatus,
      },
    ]);

    setNewName("");
    setNewStatus("unknown");

    markChanged();
  }

  // Delete ingredient from the current review.
  function deleteReviewItem(key: string) {
    setItems((previous) =>
      previous.filter((item) => item.key !== key)
    );

    markChanged();
  }

  // Save ALL remaining ingredients.
  async function save() {

    if (!hasReview) {
      setError(
        "Add at least one ingredient before saving."
      );
      return;
    }

    if (hasInvalidNames) {
      setError(
        "Please enter a name for every ingredient."
      );
      return;
    }

    if (locked || saving.current || newName.trim()) return;
    saving.current = true;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const current =
        scan ?? (await api.createScan(metadata));
      setScan(current);

      // All remaining rows are confirmed automatically.
      const payload = items.map((item) => ({
        id: item.id,
        name: item.name.trim(),
        stock_status: item.stock_status,
        confirmed: true as const,
      }));

      const saved = await api.saveReview(
        current.id,
        payload
      );

      // Keep saved database IDs in the UI.
      setItems(makeRows(saved));

      const updated: FridgeScan = {
        ...current,
        status: "reviewed",
      };

      setScan(updated);

      setScans((previous) =>
        [
          updated,
          ...previous.filter(
            (entry) => entry.id !== updated.id
          ),
        ].sort((a, b) => b.id - a.id)
      );

      setDirty(false);

      onSavedScanChange?.();

      onReviewSaved?.(
        saved.length > 0 ? current.id : null
      );

      setNotice(
        `${saved.length} ingredient(s) saved successfully to My Inventory.`
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  // Create shopping list from saved low-stock food.
  async function createShoppingList() {
    if (!scan || dirty || locked) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const list = await api.saveScanToList(scan.id);

      onShoppingListCreated(list);

      setNotice(
        `Shopping list "${list.name}" is ready.`
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="panel scan-review"
      aria-labelledby="review-title"
    >
      <h2 id="review-title">Review Food Items</h2>

      <p>
        Check the ingredients found in your fridge.
        Edit incorrect names, update stock levels,
        or delete items you don't want to save.
      </p>

      {historyLoading && (
        <p role="status">Loading saved scans...</p>
      )}

      {historyError && (
        <p role="alert" className="error">
          {historyError}
        </p>
      )}

      {/* Saved scan history */}
      <details className="scan-history">
        <summary>
          Saved scans ({scans.length})
        </summary>

        <button
          type="button"
          disabled={locked}
          onClick={() => void refreshHistory()}
        >
          Refresh saved scans
        </button>

        {scans.length === 0 && !historyLoading && (
          <p>No scans saved yet.</p>
        )}

        <ul>
          {scans.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                disabled={locked}
                onClick={() => void openScan(entry)}
              >
                {entry.is_mock ? "DEMO · " : ""}
                Scan #{entry.id} · {entry.status}

                {entry.created_at
                  ? ` · ${new Date(
                      entry.created_at
                    ).toLocaleString()}`
                  : ""}
              </button>
            </li>
          ))}
        </ul>
      </details>

      {hasReview ? (
        <>
          {metadata.is_mock && (
            <p className="mock-banner" role="note">
              <strong>Development mock results.</strong>{" "}
              These are sample foods, not AI observations
              of your photos.
            </p>
          )}

          <p className="review-source">
            {scan
              ? `Scan #${scan.id}`
              : "New review"}

            {" · "}

            {metadata.is_mock
              ? "DEMO"
              : "AI recognition"}

            {metadata.model_used &&
              ` · ${metadata.model_used}`}
          </p>

          <fieldset
            disabled={locked}
            className="review-fields"
          >
            <legend className="sr-only">
              Review detected food
            </legend>

            {/* FOOD ITEM ROWS */}
            {items.map((item, index) => (
              <div
                className="review-row"
                data-stock={item.stock_status}
                key={item.key}
              >
                {item.stock_status === "low" && (
                  <span className="low-stock-badge">
                    Low stock
                  </span>
                )}

                <label>
                  Food name {index + 1}

                  <input
                    value={item.name}
                    maxLength={100}
                    onChange={(event) =>
                      editItem(item.key, {
                        name: event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  Stock status {index + 1}

                  <select
                    value={item.stock_status}
                    onChange={(event) =>
                      editItem(item.key, {
                        stock_status:
                          event.target.value as StockStatus,
                      })
                    }
                  >
                    <option value="available">
                      Available
                    </option>

                    <option value="low">
                      Running low
                    </option>

                    <option value="unknown">
                      Unknown
                    </option>
                  </select>
                </label>

                {/* ONLY DELETE — NO INDIVIDUAL CONFIRM */}
                <button
                  type="button"
                  className="danger"
                  aria-label={`Delete item ${index + 1}`}
                  onClick={() =>
                    deleteReviewItem(item.key)
                  }
                >
                  Delete
                </button>
              </div>
            ))}

            {items.length === 0 && (
              <p>
                No ingredients remain in this review.
                Add an ingredient below to continue.
              </p>
            )}

            {/* ADD MISSING FOOD */}
            <form
              className="add-review-item"
              onSubmit={(event) => {
                event.preventDefault();
                addItem();
              }}
            >
              <label>
                Missing food name

                <input
                  value={newName}
                  maxLength={100}
                  placeholder="e.g. Tomatoes"
                  onChange={(event) => {
                    setNewName(event.target.value);
                  }}
                />
              </label>

              <label>
                Stock status

                <select
                  aria-label="Missing food stock status"
                  value={newStatus}
                  onChange={(event) => {
                    setNewStatus(
                      event.target.value as StockStatus
                    );
                  }}
                >
                  <option value="unknown">
                    Unknown
                  </option>

                  <option value="available">
                    Available
                  </option>

                  <option value="low">
                    Running low
                  </option>
                </select>
              </label>

              <button
                type="submit"
                disabled={
                  !newName.trim() ||
                  items.length >= 200
                }
              >
                Add missing item
              </button>
            </form>

            {/* REVIEW SUMMARY */}
            <p className="review-summary">
              {items.length} ingredient(s) ready for review
              {" · "}
              {lowStockCount} running low
            </p>



            {/* SAVE AND SHOPPING LIST ACTIONS */}
            <div className="review-actions">
              <button
                type="button"
                disabled={!canSave}
                onClick={() => void save()}
              >
                {busy
                  ? "Saving..."
                  : "Save Confirmed Items"}
              </button>

              <button
                type="button"
                disabled={
                  locked ||
                  !scan ||
                  dirty ||
                  lowStockCount === 0
                }
                onClick={() =>
                  void createShoppingList()
                }
              >
                Create Shopping List from Low-Stock Items
              </button>
            </div>
          </fieldset>


        </>
      ) : (
        <p>
          Scan your fridge to discover ingredients,
          or open a previously saved scan.
        </p>
      )}

      {busy && (
        <p role="status">
          Saving or loading your review...
        </p>
      )}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="review-notice"
        >
          {notice}
        </p>
      )}
    </section>
  );
}

