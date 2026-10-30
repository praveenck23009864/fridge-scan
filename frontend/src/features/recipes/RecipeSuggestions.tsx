
import { useEffect, useId, useRef, useState } from "react";
import "./RecipeSuggestions.css";
import RecipeShopping from "./RecipeShopping";

type Ingredient = {
  name: string;
  quantity: string;
};

type Recipe = {
  name: string;
  cuisine?: string;
  ingredient_match?: number;
  cooking_time_minutes: number;
  servings: number;
  difficulty: string;
  available_ingredients: Ingredient[];
  missing_ingredients: Ingredient[];
  instructions: string[];
};

type RecipeResponse = {
  model_used: string;
  is_mock: boolean;
  recipes: Recipe[];
};

type Props = {
  scanId: number | null;
  onShoppingChanged?: () => void;
  revision?: number;
};

function ChoiceChips({label, options, value, onChange}: {label: string; options: string[]; value: string; onChange: (value: string) => void}) {
  const id = useId();
  return <fieldset className="preference-group"><legend>{label}</legend><div className="preference-chips">
    {options.map(option => <label className="preference-chip" key={option}>
      <input type="radio" aria-label={option} name={id} value={option} checked={value === option} onChange={() => onChange(option)} />
      <span>{option}</span>
    </label>)}
  </div></fieldset>;
}

export default function RecipeSuggestions({ onShoppingChanged, revision }: Props) {
  const [inventory, setInventory] = useState<{available: string[]; low: string[]; unknown: string[]} | null>(null);
  const [mode, setMode] = useState("have");
  const generation = useRef(0);
  const [servings, setServings] = useState(2);
  const [diet, setDiet] = useState("Any");
  const [cuisine, setCuisine] = useState("Any");
  const [spice, setSpice] = useState("Medium");
  const [excluded, setExcluded] = useState("");
  const [maxTime, setMaxTime] = useState("30");
  const [recipes, setRecipes] = useState<RecipeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function refresh() {
      generation.current += 1;
      setRecipes(null);
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}/api/recipes/inventory`);
        if (!response.ok) throw new Error("Could not load saved ingredients.");
        const data = await response.json();
        if (!Array.isArray(data.available) || !Array.isArray(data.low) || !Array.isArray(data.unknown)) throw new Error("Invalid inventory response");
        if (active) { setInventory(data); setError(""); }
      } catch { if (active) { setInventory(null); setError("Could not load saved ingredients."); } }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, [revision]);

  async function generateRecipes() {
    if (!inventory?.available.length) {
      setError("No available saved ingredients. Update My Inventory first.");
      return;
    }

    if (!Number.isInteger(servings) || servings < 1 || servings > 12) {
      setError("Choose between 1 and 12 servings.");
      return;
    }
    const requestGeneration = ++generation.current;
    setLoading(true);
    setError("");
    setRecipes(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}/api/recipes/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode,
            servings,
            dietary_preferences: diet === "Any" ? "" : diet,
            cuisine: cuisine === "American (USA)" ? "american" : cuisine,
            spice_level: spice,
            excluded_ingredients: excluded.trim(),
            max_time: maxTime ? Number(maxTime) : null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "Recipe generation failed."
        );
      }

      if (requestGeneration === generation.current) setRecipes(data as RecipeResponse);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="recipe-section">
      <h2>AI Recipe Suggestions</h2>
      <p>Generate meals using your confirmed fridge ingredients.</p>

      <div aria-label="Saved inventory ingredients">
        <p>Available: {inventory?.available.join(', ') || 'None'}</p>
        <p>Low stock (not counted as available): {inventory?.low.join(', ') || 'None'}</p>
        <p>Unknown stock (not counted as available): {inventory?.unknown.join(', ') || 'None'}</p>
      </div>
      <label>Recommendation mode<select aria-label="Recommendation mode" value={mode} onChange={e => setMode(e.target.value)}><option value="have">Cook with what I have</option><option value="almost">Almost ready</option></select></label>
      <div className="recipe-preferences">
        <div className="preferences-heading"><span className="eyebrow">MADE FOR YOUR TABLE</span><h3>What are you in the mood for?</h3><p>Choose your preferences. We'll work with what's in your fridge.</p></div>
        <ChoiceChips label="Dietary preference" options={['Any', 'Vegetarian', 'Vegan', 'Non-vegetarian', 'High protein', 'Low carb', 'Gluten free']} value={diet} onChange={setDiet} />
        <div className="preference-basics">
          <label>Servings<input aria-label="Servings" type="number" min={1} max={12} step={1} value={servings || ''} onChange={e => setServings(Number(e.target.value))} aria-describedby="servings-hint" /><small id="servings-hint">Cooking for 1 to 12 people</small></label>
          <label>Maximum cooking time<select aria-label="Maximum cooking time" value={maxTime} onChange={e => setMaxTime(e.target.value)}><option value="">Any time</option>{[15,30,45,60].map(time => <option value={time} key={time}>{time} minutes</option>)}</select><small>Includes preparation and cooking</small></label>
        </div>
        <label>Cuisine<select aria-label="Cuisine" value={cuisine} onChange={e => setCuisine(e.target.value)}>{['Any','Indian','South Indian','Chinese','Italian','Mexican','Thai','American (USA)'].map(c => <option key={c}>{c}</option>)}</select></label>
        <ChoiceChips label="Spice level" options={['Mild','Medium','Spicy']} value={spice} onChange={setSpice} />
        <label className="avoid-field">Allergies / ingredients to avoid <span className="optional-label">Optional</span><input type="text" value={excluded} maxLength={300} onChange={e => setExcluded(e.target.value)} placeholder="e.g. peanuts, shellfish, mushrooms" aria-describedby="avoid-hint"/><small id="avoid-hint">Separate ingredients with commas. Review recipes and ingredient labels for your allergies.</small></label>
      </div>

      <button
        className="recipe-generate-button"
        aria-busy={loading}
        onClick={generateRecipes}
        disabled={loading || !inventory?.available.length || !Number.isInteger(servings) || servings < 1 || servings > 12}
      >
        {loading ? "Generating..." : "Refresh Suggestions"}
      </button>

      {!inventory?.available.length && <p>Save available ingredients in My Inventory to enable recipes.</p>}
      {error && <p role="alert" className="recipe-error">{error}</p>}

      {recipes?.recipes.length === 0 && <p role="status">No recipes match these preferences. Try adjusting your choices.</p>}

      {recipes && (
        <>
          {recipes.is_mock && (
            <p className="recipe-demo">DEMO MODE - Sample recipes</p>
          )}

          <p>Model: {recipes.model_used}</p>

          <div className="recipe-grid">
            {recipes.recipes.map((recipe, index) => (
              <article className="recipe-card" key={index}>
                <h3>{recipe.name}</h3>
                <p>{recipe.cuisine === 'american' ? 'American (USA)' : recipe.cuisine || cuisine}</p>
                <p>{recipe.ingredient_match ?? Math.round(100 * recipe.available_ingredients.length / Math.max(1, recipe.available_ingredients.length + recipe.missing_ingredients.length))}% ingredient match ? {recipe.missing_ingredients.length ? 'Required extras needed' : 'Check quantities before cooking'}</p>
                <p>
                  {recipe.cooking_time_minutes} min Â· {recipe.servings} servings
                  Â· {recipe.difficulty}
                </p>

                <h4>Available ingredients ({recipe.available_ingredients.length})</h4>
                <ul>
                  {recipe.available_ingredients.map((item, i) => (
                    <li key={i}>
                      {item.name} {item.quantity}
                    </li>
                  ))}
                </ul>

                <h4>Missing ingredients ({recipe.missing_ingredients.length})</h4>
                <ul>
                  {recipe.missing_ingredients.map((item, i) => (
                    <li key={i}>
                      {item.name} {item.quantity}
                    </li>
                  ))}
                </ul>

                <RecipeShopping items={recipe.missing_ingredients} onSaved={onShoppingChanged} />
                <h4>Instructions</h4>
                <ol>
                  {recipe.instructions.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

