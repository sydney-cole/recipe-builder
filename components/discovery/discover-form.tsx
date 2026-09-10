import { Sparkles } from "lucide-react";
import { RecipeCard } from "@/components/recipes/recipe-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { suggestions } from "@/lib/data/mock-data";

export function DiscoverForm() {
  return (
    <div className="stack gap-8">
      <Alert>
        <Sparkles size={18} />
        <AlertTitle>Discover is a preview</AlertTitle>
        <AlertDescription>These examples are not personalized and cannot be saved. Import a recipe link to add real content to your account.</AlertDescription>
      </Alert>
      <section aria-labelledby="matches-title">
        <div className="section-row"><div><h2 id="matches-title" className="section-heading">Example recommendations</h2><p className="section-copy">A preview of how future recipe discovery could look.</p></div></div>
        <div className="grid-auto">{suggestions.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} suggested preview detailsHref={null} />)}</div>
      </section>
    </div>
  );
}
