import type { TerrainRecipe, TextureBitmap } from "../types";
import type { AuxiliaryChannel } from "./render";

export type AtlasChannel = "albedo" | AuxiliaryChannel;

export interface AtlasWorkerInitMessage {
  type: "init";
  recipe: TerrainRecipe;
  textures: Array<[string, TextureBitmap]>;
}

export interface AtlasWorkerRenderMessage {
  type: "render";
  jobId: string;
  variant: number;
  channel: AtlasChannel;
}

export type AtlasWorkerRequest = AtlasWorkerInitMessage | AtlasWorkerRenderMessage;

export interface AtlasWorkerReadyMessage {
  type: "ready";
}

export interface AtlasWorkerProgressMessage {
  type: "progress";
  jobId: string;
  completed: number;
  total: number;
}

export interface AtlasWorkerResultMessage {
  type: "result";
  jobId: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
}

export interface AtlasWorkerErrorMessage {
  type: "error";
  jobId?: string;
  message: string;
}

export type AtlasWorkerResponse =
  | AtlasWorkerReadyMessage
  | AtlasWorkerProgressMessage
  | AtlasWorkerResultMessage
  | AtlasWorkerErrorMessage;
