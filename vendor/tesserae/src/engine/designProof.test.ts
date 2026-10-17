import { describe, expect, it } from "vitest";
import { createBlankRecipe } from "../types";
import { assessQuality } from "./quality";
import { buildDesignProof } from "./designProof";
import { applyProductionProfile } from "./productionProfiles";

describe("design proof", () => {
  it("turns technical atlas health into designer-facing checks", () => {
    const recipe = createBlankRecipe();
    applyProductionProfile(recipe, "orthogonal-90");
    const proof = buildDesignProof(recipe, assessQuality(recipe, new Map(), 4));
    expect(proof.checks.find((check) => check.id === "connections")?.value).toBe("47");
    expect(proof.checks.find((check) => check.id === "contract")?.status).toBe("pass");
    expect(proof.checks.find((check) => check.id === "seams")?.status).toBe("pass");
  });

  it("asks for a production contract and reusable place when both are missing", () => {
    const recipe = createBlankRecipe();
    const proof = buildDesignProof(recipe, assessQuality(recipe, new Map(), 4));
    expect(proof.status).toBe("review");
    expect(proof.checks.filter((check) => check.status === "review").map((check) => check.id)).toEqual(expect.arrayContaining(["contract", "patterns"]));
  });
});
