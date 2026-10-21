import type { ImageFile } from "../types";

export function rawMetadata(file: ImageFile | null): string {
  return file?.metadata?.raw || file?.metadata?.parameters || "";
}
