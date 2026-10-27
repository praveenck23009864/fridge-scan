
import { useEffect, useState } from "react";
import { api, type ShoppingList } from "./services/api";
import "./App.css";

function App() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [listName, setListName] = useState("");
  const [itemNames, setItemNames] = useState<
    Record<number, string>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    void loadLists();
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
              <h3>{list.name}</h3>
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
