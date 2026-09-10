import { GroceryListEditor } from "@/components/grocery/grocery-list-editor";
import type { Id } from "@/convex/_generated/dataModel";

export default async function GroceryListPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params;
  return <GroceryListEditor listId={listId as Id<"groceryLists">} />;
}
