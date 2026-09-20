import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell/app-shell";

export const metadata: Metadata = { title: "Home" };

export default function ApplicationLayout({ children }: { children: React.ReactNode }) { return <AppShell>{children}</AppShell>; }
