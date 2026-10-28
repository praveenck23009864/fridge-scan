
import { useCallback, useEffect, useState } from "react";

import {
  api,
  analyzeFridgePhotos,
  type AIAnalysisResponse,
  type ShoppingList,
} from "./services/api";

import CameraCapture, {
  type FridgePhoto,
} from "./components/CameraCapture";

import ScanReview from "./components/ScanReview";
import RecipeSuggestions from "./components/RecipeSuggestions";

import FridgeSuggestions from './components/FridgeSuggestions';
import {getFridgeSuggestions, type FridgeSuggestionsData} from './services/api';
import "./App.css";

function App() {
  const [suggestions, setSuggestions] = useState<FridgeSuggestionsData | null>(null);
  const [suggestionError, setSuggestionError] = useState('');
  const [suggestionLoading, setSuggestionLoading] = useState(true);
  const [suggestionRevision, setSuggestionRevision] = useState(0);
  const refreshSuggestions = useCallback(() => {
    setSuggestionLoading(true);
    setSuggestionError('');
    setSuggestionRevision(value => value + 1);
  }, []);
  useEffect(() => {
    let active = true;
    getFridgeSuggestions().then(data => { if (active) setSuggestions(data); })
      .catch(() => { if (active) setSuggestionError('Could not load fridge suggestions. Please retry.'); })
      .finally(() => { if (active) setSuggestionLoading(false); });
    return () => { active = false; };
  }, [suggestionRevision]);

  const [summary, setSummary] = useState({scans: 0, ingredients: 0, low: 0});
  const [activeSection, setActiveSection] = useState('dashboard');

  const [selectedScanId, setSelectedScanId] =
    useState<number | null>(null);

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

  // Analyze fridge photos.
  async function runAnalysis() {
    if (
      reviewDirty &&
      !window.confirm(
        "Discard unsaved review changes when the new analysis succeeds?"
      )
    ) {
      return;
    }

    setAnalyzing(true);
    setAnalysisError("");

    try {
      const result = await analyzeFridgePhotos(
        fridgePhotos.map((photo) => photo.file),
        photoConsent
      );

      // Prevent recipes from using an old scan.
      setSelectedScanId(null);

      setAnalysis(result);

      // Remount review with the new analysis.
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

  // Load all shopping lists.
  async function loadLists() {
    try {
      setError("");

      const data = await api.getLists();
      setLists(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Connection failed"
      );
    }
  }

  // Load initial shopping lists and backend settings.
  useEffect(() => {
    let active = true;

    void api.getLists().then(
      (data) => {
        if (active) {
          setLists(data);
        }
      },
      (err: unknown) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Connection failed"
          );
        }
      }
    );

    void api.health()
      .then((health) => {
        if (active) {
          setMockMode(health.mock_vision);
        }
      })
      .catch(() => {
        // Recognition errors are shown when analyzing.
      });

    return () => {
      active = false;
    };
  }, []);

  // Create shopping list.
  async function createList() {
    if (!listName.trim()) return;

    setLoading(true);
    setError("");

    try {
      await api.createList(listName.trim());
      setListName("");

      await loadLists();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setLoading(false);
    }
  }

  // Add shopping list item.
  async function addItem(listId: number) {
    const name = itemNames[listId]?.trim();

    if (!name) return;

    try {
      await api.addItem(listId, name);

      setItemNames((previous) => ({
        ...previous,
        [listId]: "",
      }));

      await loadLists();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Mark shopping item completed or incomplete.
  async function toggleItem(
    itemId: number,
    completed: boolean
  ) {
    try {
      await api.updateItem(itemId, {
        completed: !completed,
      });

      await loadLists();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Delete shopping list item.
  async function deleteItem(itemId: number) {
    try {
      await api.deleteItem(itemId);
      await loadLists();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Delete entire shopping list.
  async function deleteList(listId: number) {
    if (!window.confirm("Delete this shopping list?")) {
      return;
    }

    try {
      await api.deleteList(listId);
      await loadLists();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  return (
    <div className="workspace">
      <a className="skip-link" href="#dashboard">Skip to content</a>
      <aside className="sidebar">
        <a className="brand" href="#dashboard" onClick={() => setActiveSection('dashboard')}><img className="brand-mark" src="/favicon.svg" alt="" /> Fridgely</a>
        <p className="nav-caption">Your fridge, made smarter.</p>
        <nav aria-label="Main navigation">
          {['Dashboard', 'Scan Fridge', 'Recipes', 'Shopping Lists'].map((name, index) => {
            const id = ['dashboard', 'scan', 'recipes', 'shopping'][index];
            return <a key={id} href={`#${id}`} aria-current={activeSection === id ? 'location' : undefined} onClick={() => setActiveSection(id)}><span aria-hidden="true">{['\u25eb', '+', '\u2667', '\u2637'][index]}</span>{name}</a>;
          })}
        </nav>
        <div className="sidebar-tip"><span aria-hidden="true">&#10035;</span><strong>A little less waste.<br/>A lot more possibility.</strong><p>Make something good with what you already have.</p></div>
        <div className="sidebar-footer"><span className="status-dot"/> Your everyday kitchen companion</div>
      </aside>
      <main className="app">
        <div className="topbar"><span>Fridgely <span className="breadcrumb"> / My kitchen</span></span><span className="workspace-badge">Personal workspace</span></div>
        <section id="dashboard" className="dashboard" aria-labelledby="dashboard-title">
          <header className="page-heading"><div><p className="eyebrow">WELCOME TO FRIDGELY</p><h1 id="dashboard-title">Your fridge, made smarter.</h1><p>Your fridge, recipes and shopping - all in one place.</p></div><a className="button-link" href="#scan" onClick={() => setActiveSection('scan')}>+ Scan your fridge</a></header>
          <div className="summary-grid">
            {[['Saved scans', summary.scans, 'Your kitchen history', '\u25eb'], ['Detected ingredients', summary.ingredients, 'In your current review', '\u2667'], ['Low-stock food', summary.low, 'In your current review', '\u2667'], ['Shopping lists', lists.length, 'Ready for your next trip', '\u2637']].map(([title, count, note, icon]) => <article className="summary-card" key={title}><span className="summary-icon" aria-hidden="true">{icon}</span><p>{title}</p><strong>{count}</strong><small>{note}</small></article>)}
          </div>
          <div className="welcome-card"><div><p className="eyebrow">FROM FRIDGE TO FORK</p><h2>Something delicious<br/>is already in your fridge.</h2><p>Take a photo. Review your ingredients.<br/>Discover your next meal.</p><a href="#scan" className="text-link" onClick={() => setActiveSection('scan')}>Let's see what's inside <span aria-hidden="true">&#8594;</span></a></div><div className="food-art" aria-hidden="true"><div className="plate"><span>&#129361;</span><span>&#129388;</span><span>&#127813;</span></div><span className="art-label">Fresh ideas start here</span></div></div>
          <div className="workflow-steps"><span><b>01</b> Scan your fridge</span><span><b>02</b> Review & save</span><span><b>03</b> Cook something good</span></div>
        </section>
        <section id="scan" className="workspace-section" aria-label="Scan fridge">
        <div className="section-heading"><div><p className="eyebrow">KNOW WHAT YOU HAVE</p><h2>Scan your fridge</h2></div><span className="section-tag">01 / CAPTURE & REVIEW</span></div>
      {/* Camera capture */}
      <CameraCapture onPhotosChange={setFridgePhotos} />

      {fridgePhotos.length > 0 && (
        <div className="camera-status">
          <p>
            {fridgePhotos.length} fridge photo(s)
            ready for AI analysis.
          </p>
        </div>
      )}

      {/* Fridge analysis */}
      <section className="panel">
        <h2>Analyze Fridge Photos</h2>

        {mockMode && (
          <p
            className="mock-banner"
            role="note"
          >
            <strong>
              Development mock mode is enabled.
            </strong>{" "}
            Analysis returns sample foods without
            contacting GroqCloud.
          </p>
        )}

        <label>
          <input
            type="checkbox"
            checked={photoConsent}
            onChange={(event) =>
              setPhotoConsent(event.target.checked)
            }
          />

          I consent to processing these photos for
          food recognition
          {mockMode
            ? " locally in development mock mode."
            : " using the AI provider."}
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
            analyzing ||
            reviewBusy
          }
          aria-busy={analyzing}
          onClick={() => void runAnalysis()}
        >
          {analyzing
            ? "Analyzing..."
            : mockMode
              ? "Analyze with development mock"
              : "Analyze with AI"}
        </button>

        {analysisError && (
          <p
            role="alert"
            className="error"
          >
            {analysisError}
          </p>
        )}
      </section>

      {/* Scan review */}
      <ScanReview
        key={reviewVersion}
        analysis={analysis}
        disabled={analyzing}
        onDirtyChange={setReviewDirty}
        onBusyChange={setReviewBusy}
        onReviewSaved={setSelectedScanId}
        onSavedScanChange={refreshSuggestions}
        onSummaryChange={setSummary}
        onShoppingListCreated={(list) =>
          setLists((previous) => [
            list,
            ...previous.filter(
              (entry) => entry.id !== list.id
            ),
          ])
        }
      />

      </section>
      <section id="recipes" className="workspace-section" aria-label="Recipes">
      <div className="section-heading"><div><p className="eyebrow">MAKE THE MOST OF IT</p><h2>On the menu</h2></div><span className="section-tag">02 / COOK</span></div>
      {/* Recipe generator */}
      <RecipeSuggestions key={selectedScanId ?? "unsaved"} scanId={selectedScanId} />

      </section>
      <section id="shopping" className="workspace-section" aria-label="Shopping lists">
      <div className="section-heading"><div><p className="eyebrow">JUST WHAT YOU NEED</p><h2>Your next grocery trip</h2></div><span className="section-tag">03 / RESTOCK</span></div>
      {/* Create shopping list */}
      <section className="panel">
        <h2>Create Shopping List</h2>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createList();
          }}
        >
          <input
            value={listName}
            onChange={(event) =>
              setListName(event.target.value)
            }
            aria-label="Shopping list name"
            placeholder="Example: Weekly Groceries"
            maxLength={100}
            required
          />

          <button
            disabled={loading}
            type="submit"
          >
            {loading ? "Saving..." : "Create List"}
          </button>
        </form>
      </section>

      {/* Shopping list error */}
      {error && (
        <div
          role="alert"
          className="error"
        >
          {error}

          <button
            type="button"
            onClick={() => setError("")}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Shopping list history */}
      <section className="panel">
        <h2>My Shopping Lists</h2>

        {lists.length === 0 && (
          <p>
            No shopping lists yet.
            Create your first list.
          </p>
        )}

        {lists.map((list) => (
          <article
            className="list-card"
            key={list.id}
          >
            <div className="list-header">
              <h3>
                {list.is_mock && (
                  <span className="mock-label">
                    DEMO  · {" "}
                  </span>
                )}
                {list.name}
              </h3>

              <button
                type="button"
                className="danger"
                onClick={() =>
                  void deleteList(list.id)
                }
              >
                Delete List
              </button>
            </div>

            <FridgeSuggestions key={`${suggestionRevision}:${suggestions?.scan_id}`} list={list} data={suggestions}
              loading={suggestionLoading} error={suggestionError} onRefresh={refreshSuggestions}
              onUpdated={updated => setLists(previous => previous.map(entry => entry.id === updated.id ? updated : entry))} />
            <div className="list-progress"><span>{list.items.filter(item => item.completed).length} of {list.items.length} items completed</span><progress aria-label={`${list.name} completion`} max={Math.max(list.items.length, 1)} value={list.items.filter(item => item.completed).length}/></div>
            {list.items.map((item) => (
              <div
                className="shopping-item"
                key={item.id}
              >
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

                  <span
                    className={
                      item.completed
                        ? "completed"
                        : ""
                    }
                  >
                    {item.name} Ã— {item.quantity}
                  </span>
                </label>

                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    void deleteItem(item.id)
                  }
                >
                  Remove
                </button>
              </div>
            ))}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void addItem(list.id);
              }}
            >
              <input
                aria-label={`Add an item to ${list.name}`}
                placeholder="Add an item"
                value={itemNames[list.id] || ""}
                onChange={(event) =>
                  setItemNames((previous) => ({
                    ...previous,
                    [list.id]: event.target.value,
                  }))
                }
                required
              />

              <button type="submit">
                Add Item
              </button>
            </form>
          </article>
        ))}
      </section>
      </section>
      <footer className="page-footer">A more thoughtful kitchen, one meal at a time.</footer>
    </main>
    </div>
  );
}

export default App;
