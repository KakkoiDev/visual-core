import { describe, expect, it } from "vitest";
import { createBlankRecipe } from "../types";
import { analyzeSeams, buildSeamDiagnostic } from "./seams";

describe("Seam Doctor", () => {
  it("produces a channel-aware diagnostic for the worst pair", () => {
    const recipe = createBlankRecipe();
    const report = analyzeSeams(recipe, new Map(), 12, "normal");
    const diagnostic = buildSeamDiagnostic(recipe, new Map(), report.worst[0], 16);
    expect(diagnostic.finding.channel).toBe("normal");
    expect(diagnostic.first).toHaveLength(16 * 16 * 4);
    expect(diagnostic.heatmap).toHaveLength(16 * 4);
    expect(diagnostic.peakDelta).toBeGreaterThanOrEqual(0);
  });
});
