import type { Metadata } from "next";

export const metadata: Metadata = { title: "Grocery lists" };

export default function GroceryListsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
