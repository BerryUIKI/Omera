import type { ImageFile } from "../types";

export type InspectorTab = "overview" | "generation" | "rawData";

export function hasGenerationMetadata(file: ImageFile | null): boolean {
  const data = file?.metadata;
  return !!data && (data.steps != null || data.cfg_scale != null ||
    [data.format, data.prompt, data.negative_prompt, data.model_name, data.model_hash, data.sampler, data.seed]
      .some(value => typeof value === "string" && value.trim().length > 0));
}

export function rawMetadata(file: ImageFile | null): string {
  return file?.metadata?.raw || file?.metadata?.parameters || "";
}

export function inspectorTabs(file: ImageFile | null, hasLoras = false): InspectorTab[] {
  return ["overview", ...(hasGenerationMetadata(file) || hasLoras ? ["generation" as const] : []),
    ...(rawMetadata(file) ? ["rawData" as const] : [])];
}
