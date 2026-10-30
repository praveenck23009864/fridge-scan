
import { useCallback, useEffect, useState } from "react";

import {
  api,
  analyzeFridgePhotos,
  type AIAnalysisResponse,
  type ShoppingList,
} from "./services/api";

import CameraCapture, {
  type FridgePhoto,
} from "./features/fridge-scan/CameraCapture";

import ScanReview from "./features/fridge-scan/ScanReview";
import RecipeSuggestions from "./features/recipes/RecipeSuggestions";

import FridgeSuggestions from './features/shopping-lists/FridgeSuggestions';
import {getFridgeSuggestions, type FridgeSuggestionsData} from './services/api';
import "./styles/App.css";
import "./styles/v2.css";
import Inventory from "./features/inventory/Inventory";
import Dashboard from "./features/dashboard/Dashboard";
import {pagePaths, useNavigation} from "./navigation";
import ShoppingGroups from "./features/shopping-lists/ShoppingGroups";
import {LayoutDashboard, ScanLine, Boxes, ChefHat, ShoppingBasket, PanelLeft, Sprout} from "lucide-react";

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

  const [collapsed, setCollapsed] = useState(false);
  const {page: activeSection, inventoryVisited, followLink} = useNavigation();
  const [listsLoaded, setListsLoaded] = useState(false);

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
      setListsLoaded(true);
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
          setListsLoaded(true);
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
    <div className={`workspace ${collapsed ? "sidebar-collapsed" : ""}`} onClick={followLink}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <div className="sidebar-header">
          <a className="brand" aria-label="Fridgely" href="/"><img className="brand-mark" src="/favicon.svg" alt="" /><span className="brand-name">Fridgely</span></a>
          <button className="icon-button collapse-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-controls="main-navigation" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><PanelLeft size={19} aria-hidden="true"/></button>
        </div>
        <p className="nav-caption">Your fridge, made smarter.</p>
        <nav id="main-navigation" aria-label="Main navigation">
          {[{name:'Dashboard',id:'dashboard',Icon:LayoutDashboard},{name:'Scan Fridge',id:'scan',Icon:ScanLine},{name:'My Inventory',id:'inventory',Icon:Boxes},{name:'Recipes',id:'recipes',Icon:ChefHat},{name:'Shopping Lists',id:'shopping',Icon:ShoppingBasket}].map(({name,id,Icon}) =>
            <a key={id} href={pagePaths[id as keyof typeof pagePaths]} aria-label={name} title={collapsed ? name : undefined} aria-current={activeSection === id ? 'page' : undefined}><Icon size={20} aria-hidden="true"/><span className="nav-label">{name}</span></a>
          )}
        </nav>
        <div className="sidebar-tip"><Sprout size={24} aria-hidden="true"/><strong>A little less waste.<br/>A lot more possibility.</strong><p>Make something good with what you already have.</p></div>
        <div className="sidebar-footer"><span className="status-dot"/> Your everyday kitchen companion</div>
      </aside>
      <main id="main-content" className="app" tabIndex={-1}>
        <div className="topbar"><span>Fridgely <span className="breadcrumb"> / My kitchen</span></span><span className="workspace-badge">Personal workspace</span></div>
        <div hidden={activeSection !== 'dashboard'}>
          <Dashboard revision={suggestionRevision} pending={listsLoaded && !error ? lists.reduce((n, list) => n + list.items.filter(item => !item.completed).length, 0) : null} shoppingError={error} onRetryShopping={() => void loadLists()}/>
        </div>
        <div hidden={activeSection !== 'inventory'}>
          <a href={pagePaths.recipes}>Cook from My Inventory</a>
          {inventoryVisited && <Inventory locked={reviewDirty || analyzing} onChanged={() => {refreshSuggestions(); setReviewVersion(v => v + 1); setSelectedScanId(null); setAnalysis(null);}} revision={suggestionRevision}/>}
        </div>
        <section hidden={activeSection !== 'scan'} id="scan" className="workspace-section" aria-label="Scan fridge">
        <div className="section-heading"><div><p className="eyebrow">KNOW WHAT YOU HAVE</p><h2>Scan your fridge</h2></div><span className="section-tag">01 / CAPTURE & REVIEW</span></div>
      {/* Camera capture */}
      <CameraCapture active={activeSection === 'scan'} onPhotosChange={setFridgePhotos} />

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

        {analyzing&&<ol className="processing-steps" aria-label="AI processing stages"><li>Preparing images: selected photos are being uploaded.</li><li>Checking photo quality ? handled by the server.</li><li>Analyzing fridge contents ? waiting for AI.</li><li>Merging detected ingredients ? server validation.</li><li>Preparing results for review ? after the response arrives.</li><p role="status">Processing photos. The server does not report individual stage completion; this operation is indeterminate.</p></ol>}
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
      <section hidden={activeSection !== 'recipes'} id="recipes" className="workspace-section" aria-label="Recipes">
      <div className="section-heading"><div><p className="eyebrow">MAKE THE MOST OF IT</p><h2>On the menu</h2></div><span className="section-tag">02 / COOK</span></div>
      {/* Recipe generator */}
      <RecipeSuggestions revision={suggestionRevision} onShoppingChanged={()=>void loadLists()} scanId={selectedScanId} />

      </section>
      <section hidden={activeSection !== 'shopping'} id="shopping" className="workspace-section" aria-label="Shopping lists">
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
            <p>{list.items.length?Math.round(list.items.filter(i=>i.completed).length/list.items.length*100):0}% completed</p>
            <ShoppingGroups list={list} onRefresh={()=>void loadLists()} onToggle={(id,done)=>void toggleItem(id,done)} onDelete={id=>void deleteItem(id)}/>

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
