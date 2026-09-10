"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function RecipeBookError({ reset }: { error: Error; reset: () => void }) {
  return <div className="page-container"><Alert role="alert"><AlertTitle>Recipe Book could not be loaded</AlertTitle><AlertDescription>Your collection has not been changed. <Button className="mt-3" variant="secondary" onClick={reset}>Try again</Button></AlertDescription></Alert></div>;
}
