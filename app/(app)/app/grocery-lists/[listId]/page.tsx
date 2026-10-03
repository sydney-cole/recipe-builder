import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { GroceryListActions } from "@/components/grocery/grocery-list-actions";
import { SavedGroceryList } from "@/components/grocery/saved-grocery-list";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Grocery list" };

export default async function GroceryListPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  return (
    <div className="page-container">
      <Button asChild variant="ghost" className="mb-5">
        <Link href="/app/grocery-lists">
          <ArrowLeft size={17} />
          All grocery lists
        </Link>
      </Button>
      <PageHeader
        eyebrow="Grocery list"
        title="Recipe ingredients"
        description="Edit names and quantities, check items off, or remove anything you no longer need."
        actions={<GroceryListActions listId={listId} />}
      />
      <SavedGroceryList listId={listId} />
    </div>
  );
}
