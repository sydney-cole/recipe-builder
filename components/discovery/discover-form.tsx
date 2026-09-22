"use client";

import { useAction, useMutation } from "convex/react";
import { BookPlus, Clock3, ExternalLink, LoaderCircle, Search, Sparkles, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RecipeLinkImport } from "@/components/discovery/recipe-link-import";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  ingredients: string[];
  instructions: string[];
};

function normalizedTerms(values: string[]) {
  return [...new Set(values.flatMap((value) => value.split(",")).map((value) => value.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))].slice(-MAX_VISIBLE_TERMS);
}

export function DiscoverForm() {
  const router = useRouter();
  const searchRecipes = useAction(api.recipeDiscovery.search);
  const createPreview = useMutation(api.recipePreviews.createFromDiscovery);
  const [query, setQuery] = useState("");
  const [terms, setTerms] = useState<string[]>([]);
  const [results, setResults] = useState<DiscoveryRecipe[]>([]);
  const [searchResults, setSearchResults] = useState<DiscoveryRecipe[]>([]);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searched, setSearched] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [detailRecipe, setDetailRecipe] = useState<DiscoveryRecipe | null>(null);
  const [error, setError] = useState("");
  const [resultsError, setResultsError] = useState("");
  const [searchResultsError, setSearchResultsError] = useState("");
  const hasLoadedRecommendations = useRef(false);
  const requestVersion = useRef(0);

  useEffect(() => {
    if (hasLoadedRecommendations.current) return;
    hasLoadedRecommendations.current = true;

    const version = ++requestVersion.current;
    void searchRecipes({ terms: [], mode: "recommended" })
      .then((response) => {
        if (requestVersion.current !== version) return;
        setResults(response.recipes.slice(0, 3));
        if (response.unavailable) {
          setResultsError("We couldn’t load web recommendations right now. Please try again later.");
        }
      })
      .catch(() => {
        if (requestVersion.current === version) {
          setResultsError("We couldn’t load web recommendations right now. Please try a search above.");
        }
      })
      .finally(() => {
        if (requestVersion.current === version) setIsLoadingRecommendations(false);
      });
  }, [searchRecipes]);

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
    setResultsError("");
    setSearchResultsError("");
    if (nextTerms.length === 0) {
      setError("Add at least one ingredient, flavor, cuisine, or dish.");
      return;
    }

    const version = ++requestVersion.current;
    setIsLoadingRecommendations(false);
    setIsSearching(true);
    setSearched(true);
    setSearchResults([]);
    setSearchDialogOpen(true);

    try {
      const response = await searchRecipes({ terms: nextTerms, mode: "search" });
      if (requestVersion.current === version) {
        setSearchResults(response.recipes.slice(0, 3));
        if (response.unavailable) {
          setSearchResultsError("Web recipe search is temporarily unavailable. Please try again later.");
        }
      }
    } catch {
      if (requestVersion.current === version) {
        setSearchResultsError("We couldn’t search for recipes right now. Please try again.");
      }
    } finally {
      if (requestVersion.current === version) setIsSearching(false);
    }
  }

  async function selectRecipe(recipe: DiscoveryRecipe) {
    setError("");
    setSelectedUrl(recipe.url);
    try {
      const recipeId = await createPreview({
        url: recipe.url,
        title: recipe.title,
        description: recipe.description,
        source: recipe.source,
        totalTimeMinutes: recipe.totalTimeMinutes,
        matchedTerms: recipe.matchedTerms,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        sourceQuery: terms.length > 0 ? terms.join(", ") : "recommended recipes",
      });
      router.push(`/app/recipes/${recipeId}`);
    } catch {
      setSelectedUrl(null);
      setError("We found that recipe, but couldn’t open its preview. Try again.");
    }
  }

  const isLoadingResults = isSearching || isLoadingRecommendations;

  return (
    <div className="stack discovery-sections">
      <section className="search-workbench" aria-labelledby="recipe-search-title">
        <div>
          <p className="eyebrow">What sounds good?</p>
          <h2 id="recipe-search-title" className="font-display text-3xl font-semibold tracking-tight">Find dinner from a feeling, a craving, or what you have.</h2>
        </div>
        <form className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]" onSubmit={submitSearch}>
          <label className="relative flex-1">
            <span className="sr-only">Ingredients, flavor, cuisine, or dish</span>
            <Search className="absolute left-3 top-3.5 text-muted-foreground" size={18} />
            <Input className="discovery-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “chicken, broccoli, something cozy”" maxLength={500} />
          </label>
          <Button className="w-full" type="submit" size="lg" disabled={isSearching}><Sparkles size={18} />{isSearching ? "Searching…" : "Find recipes"}</Button>
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

      <section className="known-recipe-heading" aria-labelledby="known-recipe-title">
        <h2 id="known-recipe-title" className="page-title">
          Already have a recipe in mind?
        </h2>
        <p className="page-description">
          Copy and paste its link below to create an editable recipe card and prepare its ingredients for a grocery list.
        </p>
      </section>

      <RecipeLinkImport />

      <section className="discovery-recommendations" aria-labelledby="matches-title" aria-live="polite">
        <div className="section-row">
          <div>
            <h2 id="matches-title" className="section-heading">Recommended recipes</h2>
            <p className="section-copy">Up to three highly rated recipes from the web, selected and explained by the PerfectPlate agent.</p>
          </div>
          {searched && !isLoadingResults && <span className="text-sm font-bold text-primary">{results.length} {results.length === 1 ? "recipe" : "recipes"}</span>}
        </div>

        {isLoadingResults ? (
          <div aria-label="Searching for recipes">
            <p className="mb-4 rounded-lg bg-primary-soft p-3 text-sm font-semibold text-primary" role="status">
              Searching the web and loading complete recipe details…
            </p>
            <div className="grid-auto">
              {[0, 1, 2].map((item) => <Card key={item}><CardContent className="stack p-6"><Skeleton className="h-7 w-3/4" /><Skeleton className="h-16 w-full" /><Skeleton className="h-10 w-full" /></CardContent></Card>)}
            </div>
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
                  <Button onClick={() => setDetailRecipe(recipe)}><BookPlus size={16} />View recipe</Button>
                  <a className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4" href={recipe.url} target="_blank" rel="noreferrer">Source: {recipe.source} <ExternalLink size={12} aria-hidden /></a>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : resultsError ? (
          <Alert className="border-red-300 bg-red-50 text-red-900" role="alert"><AlertTitle>Recommendations unavailable</AlertTitle><AlertDescription>{resultsError}</AlertDescription></Alert>
        ) : searched ? (
          <Alert><AlertTitle>No complete recipe matches yet</AlertTitle><AlertDescription>{terms.length > 0 ? "Try removing one constraint or searching with a broader ingredient, flavor, cuisine, or dish." : "The current web results did not include enough verified recipe details. Refresh the page to search again, or use the recipe search above."}</AlertDescription></Alert>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Add at least one search idea above. You can combine ingredients, flavors, cuisines, and dishes.</p>
        )}
      </section>

      <Dialog open={searchDialogOpen} onOpenChange={setSearchDialogOpen}>
        <DialogContent className="w-[min(94vw,960px)]">
          <DialogTitle>Choose a recipe</DialogTitle>
          <DialogDescription>
            Select one result to open its full recipe page. It will not be added to your Recipe Book unless you save it there.
          </DialogDescription>
          {isSearching ? (
            <div className="mt-6" aria-label="Searching for recipe matches">
              <div className="mb-5 flex items-center justify-center gap-3 rounded-xl bg-primary-soft p-4 text-primary" role="status" aria-live="polite">
                <LoaderCircle className="animate-spin" size={22} aria-hidden />
                <span className="font-bold">Searching and scraping recipe pages…</span>
              </div>
              <div className="grid-auto" aria-hidden="true">
                {[0, 1, 2].map((item) => (
                  <Skeleton className="h-64" key={item} />
                ))}
              </div>
            </div>
          ) : searchResultsError ? (
            <Alert className="mt-6 border-red-300 bg-red-50 text-red-900" role="alert">
              <AlertTitle>Recipe search unavailable</AlertTitle>
              <AlertDescription>{searchResultsError}</AlertDescription>
            </Alert>
          ) : searchResults.length === 0 ? (
            <Alert className="mt-6">
              <AlertTitle>No complete matches</AlertTitle>
              <AlertDescription>Try a broader ingredient, flavor, cuisine, or dish.</AlertDescription>
            </Alert>
          ) : (
            <div className="mt-6 grid-auto">
              {searchResults.map((recipe) => (
                <Card key={recipe.url}>
                  <CardContent className="stack p-5">
                    <div>
                      <h3>{recipe.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{recipe.description}</p>
                    </div>
                    <p className="rounded-lg bg-primary-soft p-3 text-sm text-primary">
                      <strong>Why it fits:</strong> {recipe.matchReason}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {recipe.ingredients.length} ingredients · {recipe.instructions.length} steps
                    </p>
                    <Button onClick={() => void selectRecipe(recipe)} disabled={selectedUrl !== null}>
                      <BookPlus size={16} />
                      {selectedUrl === recipe.url ? "Opening…" : "Choose recipe"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={detailRecipe !== null} onOpenChange={(open) => { if (!open) setDetailRecipe(null); }}>
        {detailRecipe && (
          <DialogContent className="w-[min(94vw,880px)]">
            <DialogTitle>{detailRecipe.title}</DialogTitle>
            <DialogDescription>{detailRecipe.description}</DialogDescription>
            <div className="mt-6 grid gap-7 md:grid-cols-[.85fr_1.15fr]">
              <section aria-labelledby="recommendation-ingredients">
                <h3 id="recommendation-ingredients" className="section-heading">Ingredients</h3>
                <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface-subtle px-4">
                  {detailRecipe.ingredients.map((ingredient, index) => <li className="py-3 text-sm" key={`${ingredient}-${index}`}>{ingredient}</li>)}
                </ul>
              </section>
              <section aria-labelledby="recommendation-instructions">
                <h3 id="recommendation-instructions" className="section-heading">Instructions</h3>
                <ol className="mt-3 stack">
                  {detailRecipe.instructions.map((instruction, index) => (
                    <li className="flex gap-3 rounded-xl border border-border p-4" key={`${instruction}-${index}`}>
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-white">{index + 1}</span>
                      <p className="pt-0.5 text-sm leading-6">{instruction}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            <div className="mt-6 cluster">
              <Button onClick={() => selectRecipe(detailRecipe)} disabled={selectedUrl !== null}>
                <BookPlus size={16} />
                {selectedUrl === detailRecipe.url ? "Opening…" : "Choose recipe"}
              </Button>
              <Button asChild variant="secondary">
                <a href={detailRecipe.url} target="_blank" rel="noreferrer"><ExternalLink size={16} />View original</a>
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
