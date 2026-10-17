export function abortError() {
    return new DOMException("Export cancelled", "AbortError");
}
export class AtlasWorkerClient {
    static supported() {
        return typeof Worker !== "undefined";
    }
    constructor(recipe, textures) {
        this.pending = new Map();
        this.disposed = false;
        this.handleMessage = (event) => {
            const message = event.data;
            if (message.type === "ready")
                return;
            const job = message.jobId ? this.pending.get(message.jobId) : undefined;
            if (!job)
                return;
            if (message.type === "progress") {
                job.onProgress?.({ completed: message.completed, total: message.total });
                return;
            }
            this.pending.delete(message.jobId);
            if (message.type === "error")
                job.reject(new Error(message.message));
            else
                job.resolve({ width: message.width, height: message.height, pixels: new Uint8ClampedArray(message.pixels) });
        };
        this.handleWorkerError = (event) => {
            this.dispose(new Error(event.message || "Atlas worker failed"));
        };
        this.worker = new Worker(new URL("../workers/atlas.worker.ts", import.meta.url), { type: "module" });
        this.ready = new Promise((resolve, reject) => {
            const handleReady = (event) => {
                if (event.data.type === "ready") {
                    this.worker.removeEventListener("message", handleReady);
                    resolve();
                }
                else if (event.data.type === "error" && !event.data.jobId) {
                    this.worker.removeEventListener("message", handleReady);
                    reject(new Error(event.data.message));
                }
            };
            this.worker.addEventListener("message", handleReady);
        });
        this.worker.addEventListener("message", this.handleMessage);
        this.worker.addEventListener("error", this.handleWorkerError);
        this.post({ type: "init", recipe, textures: [...textures.entries()] });
    }
    async render(variant, channel, signal, onProgress) {
        if (signal?.aborted)
            throw abortError();
        await this.ready;
        const jobId = globalThis.crypto?.randomUUID?.() ?? `atlas-${Date.now()}-${Math.random()}`;
        return new Promise((resolve, reject) => {
            const abort = () => {
                this.pending.delete(jobId);
                this.dispose(abortError());
                reject(abortError());
            };
            signal?.addEventListener("abort", abort, { once: true });
            this.pending.set(jobId, {
                resolve: (result) => {
                    signal?.removeEventListener("abort", abort);
                    resolve(result);
                },
                reject: (error) => {
                    signal?.removeEventListener("abort", abort);
                    reject(error);
                },
                onProgress,
            });
            this.post({ type: "render", jobId, variant, channel });
        });
    }
    dispose(reason = new Error("Atlas worker disposed")) {
        if (this.disposed)
            return;
        this.disposed = true;
        this.worker.terminate();
        for (const job of this.pending.values())
            job.reject(reason);
        this.pending.clear();
    }
    post(message) {
        this.worker.postMessage(message);
    }
}
