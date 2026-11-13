"use client";

import { useAction, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { BookPlus, ExternalLink, LoaderCircle, Search } from "lucide-react";
import { useRef, useState } from "react";
import { ImportResultDialog } from "@/components/discovery/import-result-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { announceRecipeImport } from "@/lib/recipe-import-events";

type SearchResult = {
  url: string;
  title: string;
  description: string;
  source: string;
};

function searchErrorMessage(error: unknown) {
  const code =
    error instanceof ConvexError
      ? (error.data as { code?: string } | undefined)?.code
      : undefined;
  if (code === "search_quota_exceeded") {
    return "Recipe search has reached its limit for now. You can still paste a recipe link below.";
  }
  if (code === "search_not_configured") {
    return "Recipe search isn’t set up yet. You can still paste a recipe link below.";
  }
  return "We couldn’t search for recipes right now. Please try again.";
}

export function RecipeSearch() {
  const searchRecipes = useAction(api.recipeSearch.search);
  const queueDiscoveredUrl = useMutation(api.recipeIngestion.queueDiscoveredUrl);
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [queueingUrl, setQueueingUrl] = useState<string | null>(null);
  const [importId, setImportId] = useState<Id<"recipeImports"> | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const requestVersion = useRef(0);

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const version = ++requestVersion.current;
    setError("");
    setIsSearching(true);
    try {
      const found = await searchRecipes({ query: trimmed });
      if (requestVersion.current !== version) return;
      setResults(found);
      setSearchedQuery(trimmed);
    } catch (caughtError) {
      if (requestVersion.current !== version) return;
      setResults(null);
      setError(searchErrorMessage(caughtError));
    } finally {
      if (requestVersion.current === version) setIsSearching(false);
    }
  }

  async function importResult(result: SearchResult) {
    setError("");
    setQueueingUrl(result.url);
    try {
      const queuedImportId = await queueDiscoveredUrl({
        sourceUrl: result.url,
        sourceQuery: searchedQuery,
      });
      announceRecipeImport(queuedImportId);
      setImportId(queuedImportId);
      setDialogOpen(true);
    } catch {
      setError("We couldn’t import that recipe. Please try another result.");
    } finally {
      setQueueingUrl(null);
    }
  }

  return (
    <Card className="discovery-import-card" id="search-recipes">
      <CardContent className="discovery-import-content">
        <div className="cluster">
          <Search className="text-primary" size={20} />
          <h2 className="font-display text-3xl font-semibold tracking-tight">Search for a recipe</h2>
        </div>
        <form className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]" onSubmit={submitSearch}>
          <label className="flex-1">
            <span className="sr-only">Recipe search</span>
            <Input
              type="search"
              required
              maxLength={200}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Chicken thighs, cozy soup, 30-minute dinner…"
            />
          </label>
          <Button className="w-full" type="submit" size="lg" disabled={isSearching}>
            {isSearching ? <LoaderCircle className="animate-spin" size={17} /> : <Search size={17} />}
            {isSearching ? "Searching…" : "Search recipes"}
          </Button>
        </form>
        {error && (
          <Alert className="mt-3 border-red-200 bg-red-50" role="alert">
            <AlertTitle>Search unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {results !== null && results.length === 0 && (
          <Alert className="mt-5">
            <AlertTitle>No recipes found</AlertTitle>
            <AlertDescription>Try a broader ingredient, cuisine, or dish.</AlertDescription>
          </Alert>
        )}
        {results !== null && results.length > 0 && (
          <ul className="mt-5 grid-auto" aria-label={`Recipes for ${searchedQuery}`}>
            {results.map((result) => (
              <li key={result.url}>
                <Card className="h-full">
                  <CardContent className="stack h-full p-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{result.source}</p>
                      <h3 className="mt-1">{result.title}</h3>
                      {result.description && (
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{result.description}</p>
                      )}
                    </div>
                    <div className="mt-auto cluster">
                      <Button onClick={() => void importResult(result)} disabled={queueingUrl !== null}>
                        <BookPlus size={16} />
                        {queueingUrl === result.url ? "Importing…" : "Import recipe"}
                      </Button>
                      <Button asChild variant="secondary">
                        <a href={result.url} target="_blank" rel="noreferrer">
                          <ExternalLink size={16} />
                          View original
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ImportResultDialog importId={importId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </Card>
  );
}
