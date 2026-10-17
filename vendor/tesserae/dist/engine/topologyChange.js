export function topologyChangeImpact(recipe, next) {
    const overrideCount = next === recipe.topology ? 0 : Object.keys(recipe.overrides).length;
    return { overrideCount, requiresConfirmation: overrideCount > 0 };
}
