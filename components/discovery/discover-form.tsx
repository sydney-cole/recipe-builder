"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { suggestions } from "@/lib/data/mock-data";

const starters = ["chicken thighs", "broccoli", "cozy", "30-minute dinner"];

export function DiscoverForm() {
  const [query, setQuery] = useState("");
  const [terms, setTerms] = useState<string[]>(["spinach", "lemon", "cozy"]);
  const [searched, setSearched] = useState(true);
  const visible = useMemo(() => searched ? suggestions : [], [searched]);

  function addTerm(value: string) {
    const clean = value.trim().toLowerCase();
    if (clean && !terms.includes(clean)) setTerms((current) => [...current, clean]);
    setQuery("");
  }

  return (
    <div className="stack gap-8">
      <section className="search-workbench" aria-labelledby="recipe-search-title">
        <div>
          <p className="eyebrow">What sounds good?</p>
          <h2 id="recipe-search-title" className="font-display text-3xl font-semibold tracking-tight">Find dinner from a feeling, a craving, or what you have.</h2>
        </div>
        <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); addTerm(query); setSearched(true); }}>
          <label className="relative flex-1">
            <span className="sr-only">Ingredients, mood, or recipe type</span>
            <Search className="absolute left-3 top-3.5 text-muted-foreground" size={18} />
            <Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “chicken, broccoli, something cozy”" />
          </label>
          <Button type="submit" size="lg"><Sparkles size={18} />Find recipes</Button>
        </form>
        <div className="mt-4 cluster" aria-label="Search filters">
          {terms.map((term) => <button key={term} className="filter-chip" onClick={() => setTerms((current) => current.filter((item) => item !== term))}>{term}<X size={13} aria-hidden /></button>)}
          <Button variant="ghost" size="sm"><SlidersHorizontal size={16} />Filters</Button>
        </div>
        <div className="mt-4 cluster text-xs text-muted-foreground">
          <span>Popular:</span>{starters.map((item) => <button className="underline underline-offset-4" key={item} onClick={() => addTerm(item)}>{item}</button>)}
        </div>
      </section>

      <section aria-labelledby="matches-title">
        <div className="section-row">
          <div><h2 id="matches-title" className="section-heading">Best matches for you</h2><p className="section-copy">Mock recommendations explain why each recipe fits your request.</p></div>
          <span className="text-sm font-bold text-primary">{visible.length} ideas</span>
        </div>
        <div className="grid-auto">{visible.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} suggested detailsHref={null} />)}</div>
      </section>
    </div>
  );
}
