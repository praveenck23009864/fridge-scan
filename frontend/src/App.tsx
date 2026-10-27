
import { useEffect, useState } from "react";

import { api, type ShoppingList } from "./services/api";
import {
  analyzeFridgePhotos,
  type AIAnalysisResponse,
} from "./services/api";
import CameraCapture, {
  type FridgePhoto,
} from "./components/CameraCapture";

import ScanReview from "./components/ScanReview";

import "./App.css";
function App() {
  const [photoConsent, setPhotoConsent] = useState(false);
  const [reviewVersion, setReviewVersion] = useState(0);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] =
    useState<AIAnalysisResponse | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [fridgePhotos, setFridgePhotos] =
    useState<FridgePhoto[]>([]);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [listName, setListName] = useState("");
  const [itemNames, setItemNames] = useState<
    Record<number, string>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function runAnalysis() {
    if (reviewDirty && !window.confirm("Discard unsaved review changes when the new analysis succeeds?")) return;
    setAnalyzing(true);
    setAnalysisError("");

    try {
      const result = await analyzeFridgePhotos(
        fridgePhotos.map((photo) => photo.file),
        photoConsent
      );

      setAnalysis(result);
      setReviewVersion((version) => version + 1);
    } catch (err) {
      setAnalysisError(
        err instanceof Error
          ? err.message
          : "Something went wrong"
      );
    } finally {
      setAnalyzing(false);
    }
  }
  async function loadLists() {
    try {
      setError("");
      const data = await api.getLists();
      setLists(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Connection failed"
      );
    }
  }

  useEffect(() => {
    let active = true;
    void api.getLists().then(
      (data) => { if (active) setLists(data); },
      (err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Connection failed");
        }
      }
    );
    void api.health().then((health) => {
      if (active) setMockMode(health.mock_vision);
    }).catch(() => { /* Recognition errors remain visible on analyze. */ });
    return () => { active = false; };
  }, []);

  async function createList() {
    if (!listName.trim()) return;

    setLoading(true);
    try {
      await api.createList(listName.trim());
      setListName("");
      await loadLists();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function addItem(listId: number) {
    const name = itemNames[listId]?.trim();
    if (!name) return;

    try {
      await api.addItem(listId, name);
      setItemNames((prev) => ({
        ...prev,
        [listId]: "",
      }));
      await loadLists();
    } catch (err) {
      setError(String(err));
    }
  }

  async function toggleItem(
    itemId: number,
    completed: boolean
  ) {
    try {
      await api.updateItem(itemId, { completed: !completed });
      await loadLists();
    } catch (err) {
      setError(String(err));
    }
  }

  async function deleteItem(itemId: number) {
    try {
      await api.deleteItem(itemId);
      await loadLists();
    } catch (err) {
      setError(String(err));
    }
  }

  async function deleteList(listId: number) {
    if (!window.confirm("Delete this shopping list?")) return;

    try {
      await api.deleteList(listId);
      await loadLists();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <main className="app">
      <header>

        <h1>🥬 Fridge Scan</h1>
        <p>Smart fridge inventory & shopping lists</p>
      </header>
      <CameraCapture onPhotosChange={setFridgePhotos} />

      {fridgePhotos.length > 0 && (
        <div className="camera-status">
          <p>
            ✅ {fridgePhotos.length} fridge photo(s)
            ready for AI analysis.
          </p>
        </div>
      )}

      <section className="panel">
        <h2>Analyze Fridge Photos</h2>
        {mockMode && <p className="mock-banner" role="note"><strong>Development mock mode is enabled.</strong> Analysis returns sample foods without contacting OpenRouter.</p>}

        <label>
          <input
            type="checkbox"
            checked={photoConsent}
            onChange={(e) => {
              setPhotoConsent(e.target.checked);
            }}
          />
          I consent to processing these photos for food recognition
          {mockMode ? " locally in development mock mode." : " using the AI provider."}
        </label>

        <p>
          Photos are processed for recognition and are
          not saved by this endpoint. The AI provider's
          retention policy may still apply.
        </p>

        <button
          type="button"
          disabled={
            fridgePhotos.length === 0 ||
            !photoConsent ||
            analyzing || reviewBusy
          }
          onClick={() => void runAnalysis()}
        >
          {analyzing ? "Analyzing..." : mockMode ? "Analyze with development mock" : "Analyze with AI"}
        </button>

        {analysisError && (
          <p role="alert" className="error">
            {analysisError}
          </p>
        )}

      </section>

      <ScanReview
        key={reviewVersion}
        analysis={analysis}
        disabled={analyzing}
        onDirtyChange={setReviewDirty}
        onBusyChange={setReviewBusy}
        onShoppingListCreated={(list) => setLists((previous) => [list, ...previous.filter((entry) => entry.id !== list.id)])}
      />

      <section className="panel">
        <h2>Create Shopping List</h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void createList();
          }}
        >
          <input
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            placeholder="Example: Weekly Groceries"
            maxLength={100}
            required
          />
          <button disabled={loading} type="submit">
            {loading ? "Saving..." : "Create List"}
          </button>
        </form>
      </section>

      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      <section className="panel">
        <h2>My Shopping Lists</h2>

        {lists.length === 0 && (
          <p>No shopping lists yet. Create your first list.</p>
        )}

        {lists.map((list) => (
          <article className="list-card" key={list.id}>
            <div className="list-header">
              <h3>{list.is_mock && <span className="mock-label">DEMO ? </span>}{list.name}</h3>
              <button
                className="danger"
                onClick={() => void deleteList(list.id)}
              >
                Delete List
              </button>
            </div>

            {list.items.map((item) => (
              <div className="shopping-item" key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() =>
                      void toggleItem(
                        item.id,
                        item.completed
                      )
                    }
                  />
                  <span className={
                    item.completed ? "completed" : ""
                  }>
                    {item.name} × {item.quantity}
                  </span>
                </label>

                <button
                  className="danger"
                  onClick={() => void deleteItem(item.id)}
                >
                  Remove
                </button>
              </div>
            ))}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void addItem(list.id);
              }}
            >
              <input
                placeholder="Add an item"
                value={itemNames[list.id] || ""}
                onChange={(e) =>
                  setItemNames((prev) => ({
                    ...prev,
                    [list.id]: e.target.value,
                  }))
                }
                required
              />
              <button type="submit">Add Item</button>
            </form>
          </article>
        ))}
      </section>
    </main>
  );
}

export default App;
