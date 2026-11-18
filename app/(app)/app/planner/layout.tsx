import type { Metadata } from "next";

export const metadata: Metadata = { title: "Planner" };

export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
