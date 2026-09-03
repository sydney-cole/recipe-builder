import { AlertCircle, CheckCircle2, Clock3, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  const Icon = key.includes("active") || key.includes("ready") ? CheckCircle2 : key.includes("attention") ? AlertCircle : key.includes("scrap") ? LoaderCircle : Clock3;
  return <Badge className={key.includes("attention") ? "bg-red-50 text-red-700" : key.includes("ready") || key.includes("active") ? "bg-primary-soft text-primary" : ""}><Icon size={13} className={key.includes("scrap") ? "animate-spin" : ""} />{status}</Badge>;
}
