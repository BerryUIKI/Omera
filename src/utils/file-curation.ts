import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { ImageFile } from "../types";

export type CurationPatch = Partial<Pick<ImageFile, "rating" | "is_favorite" | "is_nsfw">>;
export interface CurationChange { fileId: number; patch: CurationPatch }
type Operation = { kind: "rating"; value: number | null } |
  { kind: "favorite" | "sensitive"; value: boolean };

export function applyCurationChange(file: ImageFile, change: CurationChange): ImageFile {
  return file.id === change.fileId ? { ...file, ...change.patch } : file;
}

/** Publish only confirmed fields, addressed to the original file even after navigation. */
export function useFileCuration(
  getFile: () => ImageFile | null,
  publish: (change: CurationChange) => void,
  write: (command: string, args: Record<string, unknown>) => Promise<unknown> = invoke,
) {
  const busy = ref(false);
  const error = ref("");
  async function run(operation: Operation): Promise<boolean> {
    const fileId = getFile()?.id;
    if (fileId == null || busy.value) return false;
    busy.value = true;
    error.value = "";
    try {
      let patch: CurationPatch;
      if (operation.kind === "rating") {
        await write("set_file_rating", { fileId, rating: operation.value });
        patch = { rating: operation.value ?? undefined };
      } else if (operation.kind === "favorite") {
        await write("set_file_favorite", { fileId, isFavorite: operation.value });
        patch = { is_favorite: operation.value };
      } else {
        await write("set_file_nsfw", { fileId, isNsfw: operation.value });
        patch = { is_nsfw: operation.value };
      }
      publish({ fileId, patch });
      return true;
    } catch (cause) {
      error.value = String(cause);
      return false;
    } finally { busy.value = false; }
  }
  return { busy, error, run };
}
