"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function GroceryListsError({ reset }: { error: Error; reset: () => void }) {
  return <div className="page-container"><Alert role="alert"><AlertTitle>Grocery lists could not be loaded</AlertTitle><AlertDescription>Your lists have not been changed. <Button className="mt-3" variant="secondary" onClick={reset}>Try again</Button></AlertDescription></Alert></div>;
}
