import { describe, expect, it } from "vitest";
import { createBlankRecipe } from "../types";
import { shouldRecover } from "./projectStore";

describe("project recovery", () => {
  it("restores a snapshot newer than the explicit save", () => {
    expect(shouldRecover({ projectId: "p1", updatedAt: 20, recipe: createBlankRecipe() }, 10)).toBe(true);
  });

  it("does not replace an equal or newer explicit save", () => {
    expect(shouldRecover({ projectId: "p1", updatedAt: 10, recipe: createBlankRecipe() }, 10)).toBe(false);
    expect(shouldRecover(null, 10)).toBe(false);
  });
});
