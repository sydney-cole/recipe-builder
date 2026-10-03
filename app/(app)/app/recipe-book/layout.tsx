import type { Metadata } from "next";

export const metadata: Metadata = { title: "Recipe Book" };

export default function RecipeBookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
