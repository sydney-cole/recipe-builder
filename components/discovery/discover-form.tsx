"use client";

import { useAction, useMutation } from "convex/react";
import { Clock3, ExternalLink, Search, Sparkles, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

const starters = ["chicken thighs", "broccoli", "cozy", "30-minute dinner"];
const MAX_VISIBLE_TERMS = 6;

type DiscoveryRecipe = {
  url: string;
  title: string;
  description: string;
  source: string;
  rating: number | null;
  ratingCount: number | null;
  totalTimeMinutes: number | null;
  matchReason: string;
  matchedTerms: string[];
};

function normalizedTerms(values: string[]) {
  return [...new Set(values.flatMap((value) => value.split(",")).map((value) => value.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))].slice(-MAX_VISIBLE_TERMS);
}

export function DiscoverForm() {
  const searchRecipes = useAction(api.recipeDiscovery.search);
  const queueRecipe = useMutation(api.recipeIngestion.queueDiscoveredUrl);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [terms, setTerms] = useState<string[]>([]);
  const [results, setResults] = useState<DiscoveryRecipe[]>([]);
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  function addTerms(values: string[]) {
    const next = normalizedTerms([...terms, ...values]);
    setTerms(next);
    setQuery("");
    return next;
  }

  function addTermToInput(term: string) {
    setQuery((current) => {
      const inputTerms = current
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (inputTerms.some((value) => value.toLowerCase() === term.toLowerCase())) {
        return current;
      }
      return [...inputTerms, term].join(", ");
    });
  }

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTerms = normalizedTerms([...terms, query]);
    setTerms(nextTerms);
    setQuery("");
    setError("");
    if (nextTerms.length === 0) {
      setError("Add at least one ingredient, flavor, cuisine, or dish.");
      return;
    }

    setIsSearching(true);
    setSearched(true);
    setResults([]);
    try {
      const response = await searchRecipes({ terms: nextTerms });
      setResults(response.recipes);
    } catch {
      setError("We couldn’t search for recipes right now. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }

  async function selectRecipe(recipe: DiscoveryRecipe) {
    setError("");
    setSelectedUrl(recipe.url);
    try {
      await queueRecipe({ sourceUrl: recipe.url, sourceQuery: terms.join(", ") });
      router.push("/app/imports");
    } catch {
      setSelectedUrl(null);
      setError("We found that recipe, but couldn’t start its import. Try again.");
    }
  }

  return (
    <div className="stack gap-8">
      <section className="search-workbench" aria-labelledby="recipe-search-title">
        <div>
          <p className="eyebrow">What sounds good?</p>
          <h2 id="recipe-search-title" className="font-display text-3xl font-semibold tracking-tight">Find dinner from a feeling, a craving, or what you have.</h2>
        </div>
        <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={submitSearch}>
          <label className="relative flex-1">
            <span className="sr-only">Ingredients, flavor, cuisine, or dish</span>
            <Search className="absolute left-3 top-3.5 text-muted-foreground" size={18} />
            <Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “chicken, broccoli, something cozy”" maxLength={500} />
          </label>
          <Button type="submit" size="lg" disabled={isSearching}><Sparkles size={18} />{isSearching ? "Searching the web…" : "Find recipes"}</Button>
        </form>
        {terms.length > 0 && (
          <div className="mt-4 cluster" aria-label="Search constraints">
            {terms.map((term) => (
              <span key={term} className="filter-chip">
                <button
                  type="button"
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => addTermToInput(term)}
                  aria-label={`Use ${term} in search field`}
                >
                  {term}
                </button>
                <button
                  type="button"
                  className="grid size-5 place-items-center rounded-full hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setTerms((current) => current.filter((item) => item !== term))}
                  aria-label={`Remove ${term}`}
                >
                  <X size={13} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 cluster text-xs text-muted-foreground">
          <span>Popular:</span>
          {starters.map((item) => <button type="button" className="underline underline-offset-4" key={item} onClick={() => addTerms([item])}>{item}</button>)}
        </div>
        {error && (
          <Alert className="mt-5 border-red-300 bg-red-50 text-red-900" role="alert">
            <AlertTitle>Recipe search needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </section>

      <section aria-labelledby="matches-title" aria-live="polite">
        <div className="section-row">
          <div><h2 id="matches-title" className="section-heading">Best matches for you</h2><p className="section-copy">The PerfectPlate agent searches live recipe pages and explains each match.</p></div>
          {searched && !isSearching && <span className="text-sm font-bold text-primary">{results.length} {results.length === 1 ? "idea" : "ideas"}</span>}
        </div>

        {isSearching ? (
          <div className="grid-auto" aria-label="Searching for recipes">
            {[0, 1, 2].map((item) => <Card key={item}><CardContent className="stack p-6"><Skeleton className="h-7 w-3/4" /><Skeleton className="h-16 w-full" /><Skeleton className="h-10 w-full" /></CardContent></Card>)}
          </div>
        ) : results.length > 0 ? (
          <div className="grid-auto">
            {results.map((recipe) => (
              <Card key={recipe.url} className="recipe-card">
                <CardContent className="stack p-6">
                  <div><h3>{recipe.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{recipe.description}</p></div>
                  <div className="recipe-meta">
                    {recipe.rating !== null && <span><Star size={14} className="inline fill-current" /> {recipe.rating}{recipe.ratingCount !== null && ` (${recipe.ratingCount.toLocaleString()})`}</span>}
                    {recipe.totalTimeMinutes !== null && <span><Clock3 size={14} className="inline" /> {recipe.totalTimeMinutes} min</span>}
                  </div>
                  <p className="rounded-lg bg-primary-soft p-3 text-sm leading-5 text-primary"><strong>Why it fits:</strong> {recipe.matchReason}</p>
                  {recipe.matchedTerms.length > 0 && <div className="cluster">{recipe.matchedTerms.map((term) => <Badge key={term}>{term}</Badge>)}</div>}
                  <Button onClick={() => selectRecipe(recipe)} disabled={selectedUrl !== null}><Sparkles size={16} />{selectedUrl === recipe.url ? "Starting import…" : "Choose this recipe"}</Button>
                  <a className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4" href={recipe.url} target="_blank" rel="noreferrer">Source: {recipe.source} <ExternalLink size={12} aria-hidden /></a>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : searched ? (
          <Alert><AlertTitle>No strong recipe matches yet</AlertTitle><AlertDescription>Try removing one constraint or searching with a broader ingredient, flavor, cuisine, or dish.</AlertDescription></Alert>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Add at least one search idea above. You can combine ingredients, flavors, cuisines, and dishes.</p>
        )}
      </section>
    </div>
  );
}
