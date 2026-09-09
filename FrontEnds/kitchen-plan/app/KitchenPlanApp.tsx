"use client";

import { useEffect, useMemo, useState } from "react";

type IngredientState = "have" | "need" | "unavailable";
type View = "plan" | "shopping" | "recipes";

type Ingredient = {
  id: string;
  name: string;
  amount: string;
  category: string;
};

type Replacement = {
  title: string;
  subtitle: string;
  reason: string;
  ingredients: Ingredient[];
};

type Meal = {
  id: string;
  day: string;
  date: string;
  title: string;
  subtitle: string;
  ingredients: Ingredient[];
  replacement?: Replacement;
  dependency?: string;
};

type Revision = {
  meals: Meal[];
  ingredientStates: Record<string, IngredientState>;
  label: string;
};

const initialMeals: Meal[] = [
  {
    id: "monday",
    day: "Mon",
    date: "Sep 7",
    title: "Beef Tacos & Black Beans",
    subtitle: "30 min · makes 4 servings",
    ingredients: [
      { id: "beef", name: "Ground beef", amount: "1 lb", category: "Butcher" },
      { id: "tortillas", name: "Corn tortillas", amount: "8–10", category: "Bakery" },
      { id: "black-beans", name: "Black beans", amount: "1 can", category: "Pantry" },
      { id: "cabbage", name: "Cabbage or lettuce", amount: "2 cups", category: "Produce" },
      { id: "cheddar", name: "Cheddar", amount: "1 cup", category: "Dairy" },
      { id: "lime", name: "Lime", amount: "1", category: "Produce" },
    ],
    replacement: {
      title: "Black Bean & Sweet Potato Tacos",
      subtitle: "35 min · pantry-forward replacement",
      reason: "Uses your bulk sweet potatoes and black beans with the same toppings.",
      ingredients: [
        { id: "sweet-potatoes", name: "Sweet potatoes", amount: "2 medium", category: "Produce" },
        { id: "tortillas", name: "Corn tortillas", amount: "8–10", category: "Bakery" },
        { id: "black-beans", name: "Black beans", amount: "1 can", category: "Pantry" },
        { id: "cabbage", name: "Cabbage or lettuce", amount: "2 cups", category: "Produce" },
        { id: "cheddar", name: "Cheddar", amount: "1 cup", category: "Dairy" },
        { id: "lime", name: "Lime", amount: "1", category: "Produce" },
      ],
    },
  },
  {
    id: "tuesday",
    day: "Tue",
    date: "Sep 8",
    title: "Sheet-Pan Lemon-Herb Chicken",
    subtitle: "50 min · makes dinner plus leftovers",
    dependency: "Extra chicken becomes Wednesday's salad",
    ingredients: [
      { id: "chicken-thighs", name: "Chicken thighs", amount: "1½ lb", category: "Butcher" },
      { id: "yellow-potatoes", name: "Yellow potatoes", amount: "1½ lb", category: "Produce" },
      { id: "carrots", name: "Carrots", amount: "3", category: "Produce" },
      { id: "onion", name: "Onion", amount: "1", category: "Produce" },
      { id: "lemon", name: "Lemon", amount: "1", category: "Produce" },
      { id: "garlic", name: "Garlic", amount: "3 cloves", category: "Produce" },
    ],
    replacement: {
      title: "Sheet-Pan Sausage, Peppers & Potatoes",
      subtitle: "45 min · one-pan replacement",
      reason: "Keeps the same workload and uses sausage plus your bulk potatoes.",
      ingredients: [
        { id: "kielbasa", name: "Kielbasa or andouille", amount: "1 lb", category: "Butcher" },
        { id: "yellow-potatoes", name: "Yellow potatoes", amount: "1½ lb", category: "Produce" },
        { id: "bell-peppers", name: "Bell peppers", amount: "2", category: "Produce" },
        { id: "onion", name: "Onion", amount: "1", category: "Produce" },
        { id: "dijon", name: "Dijon mustard", amount: "1 tbsp", category: "Pantry" },
      ],
    },
  },
  {
    id: "wednesday",
    day: "Wed",
    date: "Sep 9",
    title: "Chicken-Feta Chopped Salad",
    subtitle: "15 min · uses Tuesday's leftovers",
    dependency: "Uses chicken prepared Tuesday",
    ingredients: [
      { id: "cooked-chicken", name: "Cooked chicken", amount: "2 cups", category: "Prepared" },
      { id: "lettuce", name: "Lettuce", amount: "4 cups", category: "Produce" },
      { id: "salad-cabbage", name: "Cabbage", amount: "2 cups", category: "Produce" },
      { id: "cucumber", name: "Cucumber", amount: "1", category: "Produce" },
      { id: "feta", name: "Feta", amount: "½ cup", category: "Dairy" },
      { id: "sourdough", name: "Sourdough", amount: "4 slices", category: "Bakery" },
    ],
    replacement: {
      title: "Tuna-Feta Chopped Salad",
      subtitle: "15 min · no-cook replacement",
      reason: "Swaps in canned tuna while preserving the produce and feta already planned.",
      ingredients: [
        { id: "canned-tuna", name: "Canned tuna", amount: "2 cans", category: "Pantry" },
        { id: "lettuce", name: "Lettuce", amount: "4 cups", category: "Produce" },
        { id: "salad-cabbage", name: "Cabbage", amount: "2 cups", category: "Produce" },
        { id: "cucumber", name: "Cucumber", amount: "1", category: "Produce" },
        { id: "feta", name: "Feta", amount: "½ cup", category: "Dairy" },
        { id: "sourdough", name: "Sourdough", amount: "4 slices", category: "Bakery" },
      ],
    },
  },
];

const recipes = [
  ["Modular Tacos, Burritos & Bowls", "30 min", "Flexible"],
  ["Sheet-Pan Chicken or Pork with Vegetables", "50 min", "One pan"],
  ["Leftover Chicken-Feta Chopped Salad", "15 min", "Leftovers"],
  ["Spaghetti, Meatballs & All-Purpose Marinara", "40 min", "Freezer"],
  ["Dijon Tuna Melts & Crunchy Salad", "20 min", "Quick"],
  ["Neutral Batch Pulled Pork", "5 hr", "Freezer"],
  ["Lime Slaw", "10 min", "Side"],
  ["Leftover Fried Rice", "25 min", "Leftovers"],
  ["Sheet-Pan Sausage, Peppers, Onions & Potatoes", "45 min", "One pan"],
  ["Batch Lentil-Tomato Soup", "1 hr", "Freezer"],
  ["Bacon Carbonara", "25 min", "Quick"],
  ["Soy-Lime Salmon Rice Bowls", "35 min", "Seafood"],
  ["Batch Beef-and-Bean Chili", "1 hr", "Freezer"],
  ["Loaded Baked Potatoes or Sweet Potatoes", "75 min", "Flexible"],
  ["Kitchen-Rescue Frittata", "35 min", "Use-it-up"],
] as const;

const stateLabels: Record<IngredientState, string> = {
  have: "Have",
  need: "Need",
  unavailable: "Unavailable",
};

function initialStatesFor(meals: Meal[]) {
  return Object.fromEntries(
    meals.flatMap((meal) => meal.ingredients.map((ingredient) => [`${meal.id}:${ingredient.id}`, "have"])),
  ) as Record<string, IngredientState>;
}

export function KitchenPlanApp() {
  const [view, setView] = useState<View>("plan");
  const [activeMealId, setActiveMealId] = useState(initialMeals[0].id);
  const [planMeals, setPlanMeals] = useState<Meal[]>(initialMeals);
  const [ingredientStates, setIngredientStates] = useState<Record<string, IngredientState>>(
    initialStatesFor(initialMeals),
  );
  const [revision, setRevision] = useState<Revision | null>(null);
  const [calendarMessage, setCalendarMessage] = useState("Feed ready");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let restoredMeals: Meal[] | undefined;
    let restoredStates: Record<string, IngredientState> | undefined;
    try {
      const saved = window.localStorage.getItem("kitchen-plan-preview-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as { meals?: Meal[]; ingredientStates?: Record<string, IngredientState> };
        if (parsed.meals?.length) restoredMeals = parsed.meals;
        if (parsed.ingredientStates) restoredStates = parsed.ingredientStates;
      }
    } catch {
      window.localStorage.removeItem("kitchen-plan-preview-v1");
    }
    queueMicrotask(() => {
      if (restoredMeals) setPlanMeals(restoredMeals);
      if (restoredStates) setIngredientStates(restoredStates);
      setLoaded(true);
    });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(
      "kitchen-plan-preview-v1",
      JSON.stringify({ meals: planMeals, ingredientStates }),
    );
  }, [ingredientStates, loaded, planMeals]);

  const activeMeal = planMeals.find((meal) => meal.id === activeMealId) ?? planMeals[0];
  const activeStates = activeMeal.ingredients.map(
    (ingredient) => ingredientStates[`${activeMeal.id}:${ingredient.id}`] ?? "have",
  );
  const unavailable = activeMeal.ingredients.filter(
    (ingredient) => ingredientStates[`${activeMeal.id}:${ingredient.id}`] === "unavailable",
  );

  const shoppingItems = useMemo(
    () =>
      planMeals.flatMap((meal) =>
        meal.ingredients
          .filter((ingredient) => ingredientStates[`${meal.id}:${ingredient.id}`] === "need")
          .map((ingredient) => ({ ...ingredient, day: meal.day })),
      ),
    [ingredientStates, planMeals],
  );

  const shoppingGroups = useMemo(
    () => shoppingItems.reduce<Record<string, typeof shoppingItems>>((groups, item) => {
      (groups[item.category] ??= []).push(item);
      return groups;
    }, {}),
    [shoppingItems],
  );

  function cycleIngredient(mealId: string, ingredientId: string) {
    const key = `${mealId}:${ingredientId}`;
    const current = ingredientStates[key] ?? "have";
    const order: IngredientState[] = ["have", "need", "unavailable"];
    const next = order[(order.indexOf(current) + 1) % order.length];
    setIngredientStates((values) => ({ ...values, [key]: next }));
  }

  function mealStatus(meal: Meal) {
    const values = meal.ingredients.map(
      (ingredient) => ingredientStates[`${meal.id}:${ingredient.id}`] ?? "have",
    );
    if (values.includes("unavailable")) return "risk";
    if (values.includes("need")) return "need";
    return "ready";
  }

  function acceptReplacement() {
    if (!activeMeal.replacement) return;
    setRevision({ meals: planMeals, ingredientStates, label: activeMeal.title });
    const replacement = activeMeal.replacement;
    setPlanMeals((current) =>
      current.map((meal) =>
        meal.id === activeMeal.id
          ? { ...meal, title: replacement.title, subtitle: replacement.subtitle, ingredients: replacement.ingredients, replacement: undefined, dependency: undefined }
          : meal,
      ),
    );
    setIngredientStates((current) => ({
      ...current,
      ...Object.fromEntries(replacement.ingredients.map((ingredient) => [`${activeMeal.id}:${ingredient.id}`, "have"])),
    }));
    setCalendarMessage("Update queued");
  }

  function keepMeal() {
    setIngredientStates((current) => ({
      ...current,
      ...Object.fromEntries(unavailable.map((ingredient) => [`${activeMeal.id}:${ingredient.id}`, "need"])),
    }));
  }

  function undoReplacement() {
    if (!revision) return;
    setPlanMeals(revision.meals);
    setIngredientStates(revision.ingredientStates);
    setActiveMealId(revision.meals[0].id);
    setRevision(null);
    setCalendarMessage("Undo queued");
  }

  const status = unavailable.length ? "risk" : activeStates.includes("need") ? "need" : "ready";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Household dinner plan</div>
          <h1>Kitchen Plan</h1>
        </div>
        <div className="header-actions">
          {revision ? <button className="undo-button" type="button" onClick={undoReplacement}>Undo last swap</button> : null}
          <div className="sync-state" aria-live="polite">
            <span className="sync-dot" aria-hidden="true" />
            <span>Proton · {calendarMessage}</span>
          </div>
        </div>
      </header>

      <nav className="app-nav" aria-label="Kitchen Plan sections">
        {(["plan", "shopping", "recipes"] as View[]).map((item) => (
          <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)}>
            {item === "plan" ? "3-day plan" : item === "shopping" ? `Shopping${shoppingItems.length ? ` · ${shoppingItems.length}` : ""}` : "Recipes · 15"}
          </button>
        ))}
        <a href="/calendar/kitchen-plan.ics">Calendar feed</a>
      </nav>

      {view === "plan" ? (
        <section className="workspace">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Ingredient check</span>
              <h2>Next 3 days</h2>
            </div>
            <span className="review-note">Tap a status to change it</span>
          </div>

          <nav className="day-tabs" aria-label="Upcoming meals">
            {planMeals.map((meal) => {
              const dayStatus = mealStatus(meal);
              return (
                <button key={meal.id} type="button" className="day-tab" aria-pressed={activeMeal.id === meal.id} onClick={() => setActiveMealId(meal.id)}>
                  <span className="day-tab-top"><span>{meal.day} · {meal.date}</span><span className={`status-mark ${dayStatus}`} aria-label={dayStatus} /></span>
                  <strong>{meal.title}</strong>
                </button>
              );
            })}
          </nav>

          <div className="content-grid">
            <section className="meal-card" aria-live="polite">
              <div className="meal-heading">
                <div>
                  <span className="eyebrow">{activeMeal.day} · {activeMeal.date}</span>
                  <h2>{activeMeal.title}</h2>
                  <p>{activeMeal.subtitle}</p>
                </div>
                <span className={`readiness ${status}`}>{status === "ready" ? "Ready" : status === "need" ? "Shopping needed" : "At risk"}</span>
              </div>
              {activeMeal.dependency ? <div className="dependency">↳ {activeMeal.dependency}</div> : null}
              <div className="ingredient-list">
                {activeMeal.ingredients.map((ingredient) => {
                  const ingredientState = ingredientStates[`${activeMeal.id}:${ingredient.id}`] ?? "have";
                  return (
                    <div className="ingredient-row" key={ingredient.id}>
                      <div><strong>{ingredient.name}</strong><span>{ingredient.amount}</span></div>
                      <button type="button" className={`state-button ${ingredientState}`} onClick={() => cycleIngredient(activeMeal.id, ingredient.id)} aria-label={`${ingredient.name}: ${stateLabels[ingredientState]}. Tap to change.`}>
                        {stateLabels[ingredientState]}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            <aside className="side-column">
              <ShoppingSummary items={shoppingItems} />
              {unavailable.length && activeMeal.replacement ? (
                <section className="attention-card">
                  <div className="side-heading"><h3>Meal needs attention</h3><span>Preview</span></div>
                  <p>{unavailable.map((ingredient) => ingredient.name).join(", ")} won&apos;t be available in time.</p>
                  <div className="replacement">
                    <span>{activeMeal.title}</span><small>Replace with</small><strong>{activeMeal.replacement.title}</strong>
                    <p>{activeMeal.replacement.reason}</p>
                  </div>
                  <div className="actions">
                    <button type="button" className="primary-action" onClick={acceptReplacement}>Accept swap</button>
                    <button type="button" className="secondary-action" onClick={keepMeal}>Keep meal</button>
                  </div>
                </section>
              ) : null}
            </aside>
          </div>
        </section>
      ) : null}

      {view === "shopping" ? (
        <section className="workspace page-view">
          <div className="section-heading"><div><span className="eyebrow">Generated automatically</span><h2>Shopping list</h2></div><span className="review-note">Needed during the next 3 days</span></div>
          {shoppingItems.length ? (
            <div className="shopping-groups">
              {Object.entries(shoppingGroups).map(([category, items]) => (
                <section className="shopping-group" key={category}>
                  <h3>{category}</h3>
                  <ul>{items?.map((item) => {
                    return <li key={`${item.day}:${item.id}`}><div className="shopping-item-control"><input type="checkbox" aria-label={`Mark ${item.name} purchased`} /> <span><strong>{item.name}</strong><small>{item.amount}</small></span></div><span>{item.day}</span></li>;
                  })}</ul>
                </section>
              ))}
            </div>
          ) : <div className="large-empty"><span>✓</span><h3>Your list is clear</h3><p>Mark an ingredient “Need” and it will appear here.</p></div>}
        </section>
      ) : null}

      {view === "recipes" ? (
        <section className="workspace page-view">
          <div className="section-heading"><div><span className="eyebrow">Imported from Paprika</span><h2>Base recipe catalog</h2></div><a className="paprika-link" href="paprika3://">Open Paprika</a></div>
          <div className="recipe-grid">
            {recipes.map(([name, time, tag], index) => <article className="recipe-card" key={name}><span>{String(index + 1).padStart(2, "0")}</span><h3>{name}</h3><p>{time} · {tag}</p></article>)}
          </div>
        </section>
      ) : null}

      <footer className="app-footer"><span>Saved on this device</span><span>Server sync is the next build step</span></footer>
    </main>
  );
}

function ShoppingSummary({ items }: { items: Array<Ingredient & { day: string }> }) {
  return (
    <section className="side-card">
      <div className="side-heading"><h3>Shopping list</h3><span>{items.length} {items.length === 1 ? "item" : "items"}</span></div>
      {items.length ? (
        <ul className="shopping-list">
          {items.map((item) => <li key={`${item.day}:${item.id}`}><span><strong>{item.name}</strong><small>{item.amount} · {item.category}</small></span><span className="needed-day">{item.day}</span></li>)}
        </ul>
      ) : <div className="empty-state"><span aria-hidden="true">✓</span><p>Nothing needed yet</p></div>}
    </section>
  );
}
