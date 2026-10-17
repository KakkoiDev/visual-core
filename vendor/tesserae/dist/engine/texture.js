export function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error("Lecture du fichier impossible"));
        reader.readAsDataURL(file);
    });
}
async function decodeTextureBitmap(url, maxSize = 512) {
    const response = await fetch(url);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const sourceWidth = bitmap.width;
    const sourceHeight = bitmap.height;
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
        throw new Error("Canvas 2D indisponible");
    context.imageSmoothingEnabled = true;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const image = context.getImageData(0, 0, width, height);
    return { bitmap: { width, height, data: image.data }, sourceWidth, sourceHeight };
}
export async function textureBitmapFromUrl(url, maxSize = 512) {
    return (await decodeTextureBitmap(url, maxSize)).bitmap;
}
export async function textureBitmapFromFile(file, maxSize = 512) {
    const url = await readFileAsDataUrl(file);
    const decoded = await decodeTextureBitmap(url, maxSize);
    return { url, ...decoded };
}
export function textureBitmapToDataUrl(bitmap) {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context)
        throw new Error("Canvas 2D indisponible");
    context.putImageData(new ImageData(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height), 0, 0);
    return canvas.toDataURL("image/png");
}
