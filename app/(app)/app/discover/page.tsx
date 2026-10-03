import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { RecipeLinkImport } from "@/components/discovery/recipe-link-import";

export const metadata: Metadata = { title: "Discover recipes" };

export default function DiscoverPage() { return <div className="page-container"><PageHeader eyebrow="Discover" title="Find your next recipe" description="Paste the link to a recipe you already have in mind to create an editable recipe card." /><RecipeLinkImport /></div>; }
