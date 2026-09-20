import { Skeleton } from "@/components/ui/skeleton";
export default function AppLoading() { return <div className="page-container" role="status" aria-live="polite"><span className="sr-only">Loading page…</span><Skeleton className="h-8 w-32" /><Skeleton className="mt-4 h-12 max-w-xl" /><div className="mt-10 grid-auto">{[1,2,3].map((item) => <Skeleton key={item} className="h-80" />)}</div></div>; }
