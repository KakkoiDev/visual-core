import { describe, expect, it } from "vitest";
import { createBlankRecipe } from "../types";
import { topologyChangeImpact } from "./topologyChange";

describe("topology change guard", () => {
  it("switches directly when no custom tile pixels can be lost", () => {
    const recipe = createBlankRecipe();
    expect(topologyChangeImpact(recipe, "dual16")).toEqual({ overrideCount: 0, requiresConfirmation: false });
  });

  it("requires confirmation before clearing custom tile overrides", () => {
    const recipe = createBlankRecipe();
    recipe.overrides = { 1: "data:image/png;base64,one", 3: "data:image/png;base64,two" };
    expect(topologyChangeImpact(recipe, "dual16")).toEqual({ overrideCount: 2, requiresConfirmation: true });
    expect(topologyChangeImpact(recipe, "blob47")).toEqual({ overrideCount: 0, requiresConfirmation: false });
  });
});
