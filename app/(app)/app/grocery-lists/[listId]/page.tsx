import Link from "next/link";
import { ArrowLeft, Share2 } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { GroceryListActions } from "@/components/grocery/grocery-list-actions";
import { GroceryListEditor } from "@/components/grocery/grocery-list-editor";
import { SavedGroceryList } from "@/components/grocery/saved-grocery-list";
import { Button } from "@/components/ui/button";

export default async function GroceryListPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const isPreviewList = listId === "weeknight";

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
        title={isPreviewList ? "This week" : "Recipe ingredients"}
        description="Edit names and quantities, check items off, or remove anything you no longer need."
        actions={
          <>
            <Button variant="secondary">
              <Share2 size={17} />
              Share
            </Button>
            {!isPreviewList && <GroceryListActions listId={listId} />}
          </>
        }
      />
      {isPreviewList ? (
        <GroceryListEditor initialName="This week" canSave={false} />
      ) : (
        <SavedGroceryList listId={listId} />
      )}
    </div>
  );
}
