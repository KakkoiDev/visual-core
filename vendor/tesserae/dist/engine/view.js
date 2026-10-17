export const UI_SCALE_OPTIONS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];
export const MIN_UI_WORKSPACE_WIDTH = 1024;
export function maximumUiScale(viewportWidth) {
    const fittingScale = Math.max(1, viewportWidth / MIN_UI_WORKSPACE_WIDTH);
    return [...UI_SCALE_OPTIONS].reverse().find((scale) => scale <= fittingScale) ?? 1;
}
export function clampUiScale(scale, viewportWidth) {
    return Math.min(scale, maximumUiScale(viewportWidth));
}
export function fitSideDockWidths(logicalWidth, left, right, minLeft = 190, minRight = 260, minPreview = 420, gutters = 14) {
    let nextLeft = Math.max(minLeft, left);
    let nextRight = Math.max(minRight, right);
    const available = Math.max(minLeft + minRight, logicalWidth - minPreview - gutters);
    let overflow = Math.max(0, nextLeft + nextRight - available);
    const leftReduction = Math.min(overflow, nextLeft - minLeft);
    nextLeft -= leftReduction;
    overflow -= leftReduction;
    nextRight -= Math.min(overflow, nextRight - minRight);
    return { left: Math.floor(nextLeft), right: Math.floor(nextRight) };
}
export function recommendedUiScale(viewportWidth, viewportHeight = viewportWidth * 9 / 16) {
    // Keep the logical workspace near 1536 × 864 across standard desktop,
    // QHD, ultrawide and 4K resolutions. Both dimensions matter so short
    // ultrawide windows are not over-scaled.
    const resolutionRatio = Math.min(viewportWidth / 1920, viewportHeight / 1080);
    const targetScale = Math.max(1, Math.min(2.5, resolutionRatio * 1.25));
    return [...UI_SCALE_OPTIONS].reverse().find((scale) => scale <= targetScale) ?? 1;
}
export function panForAnchoredZoom(pan, anchor, currentZoom, nextZoom) {
    if (currentZoom <= 0 || nextZoom <= 0 || currentZoom === nextZoom)
        return pan;
    const ratio = nextZoom / currentZoom;
    return {
        x: anchor.x - (anchor.x - pan.x) * ratio,
        y: anchor.y - (anchor.y - pan.y) * ratio,
    };
}
