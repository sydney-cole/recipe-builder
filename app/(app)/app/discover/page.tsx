import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { DiscoverForm } from "@/components/discovery/discover-form";

export const metadata: Metadata = { title: "Discover recipes" };

export default function DiscoverPage() { return <div className="page-container"><PageHeader eyebrow="Discover" title="Find your next recipe" description="Search by ingredients you have, what you are in the mood for, or the type of recipe you need." /><DiscoverForm /></div>; }
