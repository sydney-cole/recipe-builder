import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { RecipeLinkImport } from "@/components/discovery/recipe-link-import";
import { RecipeSearch } from "@/components/discovery/recipe-search";

export const metadata: Metadata = { title: "Discover recipes" };

export default function DiscoverPage() { return <div className="page-container"><PageHeader eyebrow="Discover" title="Find your next recipe" description="Search the web for something new, or paste the link to a recipe you already have in mind." /><div className="stack"><RecipeSearch /><RecipeLinkImport /></div></div>; }
