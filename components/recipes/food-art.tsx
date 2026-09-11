"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Recipe } from "@/lib/data/types";

export function FoodArt({
  variant,
  label,
  imageUrl,
}: {
  variant: Recipe["art"];
  label?: string;
  imageUrl?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl && imageUrl !== failedUrl);
  return (
    <div className={cn("food-art", variant)} role="img" aria-label={label ?? "Abstract food illustration"}>
      {showImage && (
        // The image is served by Convex storage through a runtime-generated URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="food-art-image"
          src={imageUrl}
          alt=""
          aria-hidden
          onError={() => setFailedUrl(imageUrl ?? null)}
        />
      )}
      {label && <span className="food-art-label">{label}</span>}
    </div>
  );
}
