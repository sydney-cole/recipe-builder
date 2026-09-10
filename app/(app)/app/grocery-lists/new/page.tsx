import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { GroceryListEditor } from "@/components/grocery/grocery-list-editor";
import { Button } from "@/components/ui/button";

export default function NewGroceryListPage() {
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
        title="New grocery list"
        description="Add ingredients and adjust their names, quantities, and units as you shop."
      />
      <GroceryListEditor initialItems={[]} />
    </div>
  );
}
