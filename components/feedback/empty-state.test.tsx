import { render, screen } from "@testing-library/react";
import { BookOpen } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders its message and optional action", () => {
    render(
      <EmptyState
        icon={BookOpen}
        title="Nothing saved"
        description="Import your first recipe."
        action={<button>Import</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Nothing saved" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
  });
});
