import type { Metadata } from "next";

export const metadata: Metadata = { title: "Meal Plan" };

export default function MealPlanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
