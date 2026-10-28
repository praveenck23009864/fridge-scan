
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
  onSummaryChange?: (summary: {scans: number; ingredients: number; low: number}) => void;
  onSavedScanChange?: () => void;
  onReviewSaved?: (scanId: number | null) => void;
};

function savedRows(items: DetectedItem[]): ReviewItem[] {
  return items.map((item) => ({
    ...item,
    key: crypto.randomUUID(),
  }));
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Could not complete the request. Please try again.";
}

export default function ScanReview({
  analysis,
  disabled = false,
  onDirtyChange,
  onBusyChange,
  onShoppingListCreated,
  onReviewSaved,
  onSavedScanChange,
  onSummaryChange,
}: Props) {
  const [items, setItems] = useState<ReviewItem[]>(() =>
    (analysis?.items ?? []).map((item) => ({
      ...item,
      key: crypto.randomUUID(),
      confirmed: false,
    }))
  );

  const [scan, setScan] = useState<FridgeScan | null>(
    null
  );

  const [metadata, setMetadata] = useState({
    is_mock: analysis?.is_mock ?? false,
    model_used: analysis?.model_used ?? null,
  });

  const [scans, setScans] = useState<FridgeScan[]>([]);
  const [historyLoading, setHistoryLoading] =
    useState(true);
  const [historyError, setHistoryError] = useState("");

  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(!!analysis);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [newName, setNewName] = useState("");
  const [newStatus, setNewStatus] =
    useState<StockStatus>("unknown");

  const hasUnsaved =
    dirty ||
    items.some((item) => !item.confirmed) ||
    !!newName.trim();

  const locked = busy || disabled || historyLoading;

  const confirmed = items.filter(
    (item) => item.confirmed
  );

  const confirmedLow = confirmed.filter(
    (item) => item.stock_status === "low"
  ).length;

  const hasReview =
    !!analysis || !!scan || items.length > 0;

  useEffect(() => {
    onSummaryChange?.({scans: scans.length, ingredients: items.length, low: items.filter(item => item.stock_status === 'low').length});
  }, [scans.length, items, onSummaryChange]);

  // Notify App.tsx about unsaved changes.
  useEffect(() => {
    onDirtyChange(hasUnsaved);
  }, [hasUnsaved, onDirtyChange]);

  // Notify App.tsx when this component is busy.
  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!hasUnsaved) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);

    return () => {
      window.removeEventListener(
        "beforeunload",
        warn
      );
    };
  }, [hasUnsaved]);

  // Load saved scan history on mount.
  useEffect(() => {
    let active = true;

    async function restore() {
      try {
        const saved = await api.getScans();

        if (!active) return;

        setScans(saved);

        const latest = saved.find(
          (entry) => entry.status === "reviewed"
        );

        // Do not overwrite a fresh photo analysis.
        if (!analysis && latest) {
          const rows = await api.getScanItems(
            latest.id
          );

          if (!active) return;

          setScan(latest);

          setMetadata({
            is_mock: latest.is_mock,
            model_used: latest.model_used,
          });

          setItems(savedRows(rows));
          onSavedScanChange?.();
          setDirty(false);

          // Re-enable recipes for saved ingredients.
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

    // Restore should run when the analysis changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis]);

  // Refresh saved scan history.
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

  // Open a previously saved scan.
  async function openScan(selected: FridgeScan) {
    if (
      hasUnsaved &&
      !window.confirm(
        "Discard unsaved review changes and open this saved scan?"
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const rows = await api.getScanItems(
        selected.id
      );

      setScan(selected);

      setMetadata({
        is_mock: selected.is_mock,
        model_used: selected.model_used,
      });

      setItems(savedRows(rows));
      onSavedScanChange?.();
      setDirty(false);
      setNewName("");

      // Enable recipes only when saved food exists.
      if (
        selected.status === "reviewed" &&
        rows.length > 0
      ) {
        onReviewSaved?.(selected.id);
      } else {
        onReviewSaved?.(null);
      }

      setNotice(
        `Loaded saved scan #${selected.id}.`
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Edit a review item.
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

    setDirty(true);

    // Require saving after edits.
    onReviewSaved?.(null);

    setNotice("");
    setError("");
  }

  // Add a missing food item.
  function addItem() {
    const name = newName.trim();

    if (!name) return;

    setItems((previous) => [
      ...previous,
      {
        key: crypto.randomUUID(),
        name,
        stock_status: newStatus,
        confirmed: false,
      },
    ]);

    setNewName("");
    setNewStatus("unknown");

    setDirty(true);
    onReviewSaved?.(null);

    setNotice("");
    setError("");
  }

  // Delete a draft review item.
  function deleteReviewItem(key: string) {
    setItems((previous) =>
      previous.filter(
        (item) => item.key !== key
      )
    );

    setDirty(true);
    onReviewSaved?.(null);

    setNotice("");
    setError("");
  }

  // Save confirmed food items to the database.
  async function save() {
    if (
      confirmed.some(
        (item) => !item.name.trim()
      )
    ) {
      setError(
        "Enter a food name for every confirmed item."
      );
      return;
    }

    if (confirmed.length === 0 && scan === null) {
      setError(
        "Confirm at least one food item before saving."
      );
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const current =
        scan ?? (await api.createScan(metadata));

      setScan(current);

      const saved = await api.saveReview(
        current.id,
        confirmed.map((item) => ({
          id: item.id,
          name: item.name.trim(),
          stock_status: item.stock_status,
          confirmed: true,
        }))
      );

      let index = 0;

      // Update local review with saved item IDs.
      setItems(
        items.map((item) =>
          item.confirmed
            ? {
                ...item,
                ...saved[index++],
              }
            : {
                ...item,
                id: undefined,
              }
        )
      );

      const updated: FridgeScan = {
        ...current,
        status: "reviewed",
      };

      setScan(updated);

      setScans((previous) =>
        [
          updated,
          ...previous.filter(
            (entry) => entry.id !== current.id
          ),
        ].sort(
          (a, b) => b.id - a.id
        )
      );

      setDirty(false);

      onSavedScanChange?.();
      const remaining =
        items.length - saved.length;

      // Recipes use the confirmed snapshot saved to SQLite.
      // Unchecked drafts do not block recipe generation.
      if (saved.length > 0) {
        onReviewSaved?.(current.id);
      } else {
        onReviewSaved?.(null);
      }

      setNotice(
        `Saved ${saved.length} confirmed item(s).${
          remaining > 0
            ? ` ${remaining} unchecked item(s) remain unsaved drafts.`
            : " You can safely reload."
        }`
      );
    } catch (err) {
      onReviewSaved?.(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Create shopping list from saved low-stock food.
  async function createShoppingList() {
    if (!scan || dirty) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const list = await api.saveScanToList(
        scan.id
      );

      onShoppingListCreated(list);

      setNotice(
        `Shopping list "${list.name}" is ready below.`
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
      <h2 id="review-title">
        Review food items
      </h2>

      <p>
        Correct the detections, confirm each item,
        then save your review.
      </p>

      {historyLoading && (
        <p role="status">
          Loading saved scans...
        </p>
      )}

      {historyError && (
        <p
          role="alert"
          className="error"
        >
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
          onClick={() =>
            void refreshHistory()
          }
        >
          Refresh saved scans
        </button>

        {scans.length === 0 &&
          !historyLoading && (
            <p>No scans saved yet.</p>
          )}

        <ul>
          {scans.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                disabled={locked}
                onClick={() =>
                  void openScan(entry)
                }
              >
                {entry.is_mock
                  ? "DEMO · "
                  : ""}

                Scan #{entry.id} ·{" "}
                {entry.status}

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
            <p
              className="mock-banner"
              role="note"
            >
              <strong>
                Development mock results.
              </strong>{" "}

              These are sample foods, not AI
              observations of your photos.
              Saved scans and shopping lists
              stay labeled DEMO.
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

          <p>
            Only confirmed items are kept in
            the saved scan. Unchecked items
            remain unsaved drafts. Editing
            an item requires confirmation again.
          </p>

          {/* Food item review */}
          <fieldset
            disabled={locked}
            className="review-fields"
          >
            <legend className="sr-only">
              Review detected food
            </legend>

            {items.map((item, index) => (
              <div
                className="review-row"
                data-stock={item.stock_status}
                key={item.key}
              >
                {item.stock_status === "low" && <span className="low-stock-badge">Low stock</span>}
                <label>
                  Food name {index + 1}

                  <input
                    value={item.name}
                    maxLength={100}
                    onChange={(event) =>
                      editItem(
                        item.key,
                        {
                          name:
                            event.target.value,
                          confirmed: false,
                        }
                      )
                    }
                  />
                </label>

                <label>
                  Stock status {index + 1}

                  <select
                    value={item.stock_status}
                    onChange={(event) =>
                      editItem(
                        item.key,
                        {
                          stock_status:
                            event.target.value as StockStatus,
                          confirmed: false,
                        }
                      )
                    }
                  >
                    <option value="low">
                      Low
                    </option>

                    <option value="available">
                      Available
                    </option>

                    <option value="unknown">
                      Unknown
                    </option>
                  </select>
                </label>

                <label className="confirm-item">
                  <input
                    type="checkbox"
                    checked={item.confirmed}
                    disabled={
                      !item.name.trim()
                    }
                    onChange={(event) =>
                      editItem(
                        item.key,
                        {
                          confirmed:
                            event.target.checked,
                        }
                      )
                    }
                  />

                  Confirm item {index + 1}
                </label>

                <button
                  type="button"
                  className="danger"
                  aria-label={`Delete item ${
                    index + 1
                  }`}
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
                No items in this review.
                Add a missing food below.
              </p>
            )}

            {/* Add missing food */}
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
                  onChange={(event) => {
                    setNewName(
                      event.target.value
                    );
                    onReviewSaved?.(dirty || event.target.value.trim() ? null : (confirmed.length > 0 ? scan?.id ?? null : null));
                  }}
                  placeholder="e.g. Tomatoes"
                />
              </label>

              <label>
                Missing food stock status

                <select
                  value={newStatus}
                  onChange={(event) =>
                    setNewStatus(
                      event.target.value as StockStatus
                    )
                  }
                >
                  <option value="unknown">
                    Unknown
                  </option>

                  <option value="available">
                    Available
                  </option>

                  <option value="low">
                    Low
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

            <p>
              {confirmed.length} of{" "}
              {items.length} items confirmed
              {" · "}
              {confirmedLow} low-stock
            </p>

            {/* Review actions */}
            <div className="review-actions">
              <button
                type="button"
                disabled={
                  !dirty ||
                  (!scan &&
                    confirmed.length === 0)
                }
                onClick={() =>
                  void save()
                }
              >
                Save confirmed items
              </button>

              <button
                type="button"
                disabled={
                  !scan ||
                  dirty ||
                  confirmedLow === 0
                }
                onClick={() =>
                  void createShoppingList()
                }
              >
                Create shopping list from
                low-stock items
              </button>
            </div>
          </fieldset>

          <p className="review-hint">
            Save before creating a list.
            Each scan creates one shopping
            list snapshot. Later review edits
            do not overwrite that list.
            You can edit the list below.
          </p>
        </>
      ) : (
        <p>
          Analyze fridge photos to start
          a review, or open a saved scan.
        </p>
      )}

      {busy && (
        <p role="status">
          Saving or loading your review...
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="error"
        >
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
