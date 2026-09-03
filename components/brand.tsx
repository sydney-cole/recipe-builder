import { Sprout } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="app-brand">
      <span className="brand-mark" aria-hidden="true"><Sprout size={19} /></span>
      {!compact && <span className="brand-name">PerfectPlate</span>}
    </span>
  );
}
