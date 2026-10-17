import type { TerrainRecipe } from "../types";
import type { ProjectLibrary } from "./projects";
import { parseProjectLibrary } from "./projects";

const DATABASE_NAME = "tesserae.workspace";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace";
const LIBRARY_KEY = "project-library";
const RECOVERY_PREFIX = "recovery:";
const GODOT_PROJECT_HANDLE_KEY = "godot-project-handle";

interface WorkspaceRecord<T> {
  key: string;
  updatedAt: number;
  value: T;
}

export interface RecoverySnapshot {
  projectId: string;
  updatedAt: number;
  recipe: TerrainRecipe;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
    request.onblocked = () => reject(new Error("Tesserae storage upgrade is blocked by another tab"));
  });
}

async function readRecord<T>(key: string): Promise<WorkspaceRecord<T> | null> {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as WorkspaceRecord<T> | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Unable to read Tesserae storage"));
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => database.close();
  });
}

async function writeRecord<T>(record: WorkspaceRecord<T>): Promise<void> {
  const database = await openDatabase();
  if (!database) throw new Error("IndexedDB unavailable");
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Unable to save Tesserae storage")); };
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("Tesserae storage transaction aborted")); };
  });
}

async function deleteRecord(key: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Unable to clear Tesserae recovery")); };
  });
}

export async function loadDurableProjectLibrary(): Promise<ProjectLibrary | null> {
  const record = await readRecord<ProjectLibrary>(LIBRARY_KEY);
  return record ? parseProjectLibrary(JSON.stringify(record.value)) : null;
}

export async function saveDurableProjectLibrary(library: ProjectLibrary): Promise<void> {
  await writeRecord({ key: LIBRARY_KEY, updatedAt: Date.now(), value: library });
}

export async function loadRecoverySnapshot(projectId: string): Promise<RecoverySnapshot | null> {
  const record = await readRecord<RecoverySnapshot>(`${RECOVERY_PREFIX}${projectId}`);
  return record?.value ?? null;
}

export async function saveRecoverySnapshot(projectId: string, recipe: TerrainRecipe, updatedAt = Date.now()): Promise<void> {
  const snapshot: RecoverySnapshot = { projectId, recipe, updatedAt };
  await writeRecord({ key: `${RECOVERY_PREFIX}${projectId}`, updatedAt, value: snapshot });
}

export async function clearRecoverySnapshot(projectId: string): Promise<void> {
  await deleteRecord(`${RECOVERY_PREFIX}${projectId}`);
}

export function shouldRecover(snapshot: RecoverySnapshot | null, savedAt: number): snapshot is RecoverySnapshot {
  return Boolean(snapshot && snapshot.updatedAt > savedAt);
}

export async function loadGodotProjectHandle(): Promise<FileSystemDirectoryHandle | null> {
  return (await readRecord<FileSystemDirectoryHandle>(GODOT_PROJECT_HANDLE_KEY))?.value ?? null;
}

export async function saveGodotProjectHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await writeRecord({ key: GODOT_PROJECT_HANDLE_KEY, updatedAt: Date.now(), value: handle });
}
