import { AlertCircle, CheckCircle2, Clock3, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  const inProgress = key.includes("scrap") || key.includes("retriev") || key.includes("generat");
  const Icon = key.includes("active") || key.includes("ready") || key.includes("saved") ? CheckCircle2 : key.includes("attention") ? AlertCircle : inProgress ? LoaderCircle : Clock3;
  return <Badge className={key.includes("attention") ? "bg-red-50 text-red-700" : key.includes("ready") || key.includes("active") || key.includes("saved") ? "bg-primary-soft text-primary" : ""}><Icon size={13} className={inProgress ? "animate-spin" : ""} />{status}</Badge>;
}
