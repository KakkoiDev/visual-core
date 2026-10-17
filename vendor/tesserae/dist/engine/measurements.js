export function rescaleCliffHeightPixels(recipe, previousSize, nextSize) {
    if (previousSize === nextSize)
        return;
    const factor = previousSize / nextSize;
    for (const layer of recipe.layers) {
        layer.cliffHeightSteps = Math.max(1 / Math.max(1, nextSize), Math.min(4, layer.cliffHeightSteps * factor));
    }
}
export function rescaleSpatialRecipeValues(recipe, previousSize, nextSize) {
    if (previousSize === nextSize)
        return;
    const factor = previousSize / nextSize;
    recipe.shape.outerRadius = Math.max(0, Math.min(0.5, recipe.shape.outerRadius * factor));
    recipe.shape.innerRadius = Math.max(0, Math.min(0.5, recipe.shape.innerRadius * factor));
    recipe.shape.roughness = Math.max(0, Math.min(4, recipe.shape.roughness * factor));
    recipe.shape.edgeDeformations = recipe.shape.edgeDeformations.map((effect) => ({
        ...effect,
        amount: Math.max(0, Math.min(4, effect.amount * factor)),
    }));
    recipe.shape.cutoutExtrusion = Math.max(0, Math.min(1, recipe.shape.cutoutExtrusion * factor));
    for (const layer of recipe.layers) {
        layer.width = Math.max(0, Math.min(1, layer.width * factor));
        layer.distanceOffset *= factor;
        layer.cutoff *= factor;
        layer.innerFade *= factor;
        layer.outerFade *= factor;
        layer.shadowDistance = Math.max(0, Math.min(2, layer.shadowDistance * factor));
        layer.shadowBlur = Math.max(0, Math.min(1, layer.shadowBlur * factor));
        layer.cliffOffsetX *= factor;
        layer.cliffOffsetY *= factor;
        layer.innerContour = { ...layer.innerContour, amplitude: layer.innerContour.amplitude * factor };
        layer.outerContour = { ...layer.outerContour, amplitude: layer.outerContour.amplitude * factor };
    }
    rescaleCliffHeightPixels(recipe, previousSize, nextSize);
}
