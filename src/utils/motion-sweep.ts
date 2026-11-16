/**
 * Wiring that turns the pure motion-scoring engine into persisted values.
 *
 * Decoding only ever happens in the WebView (see `motion-score.ts`), so the
 * batch sweep is driven from here rather than from Rust: the backend supplies
 * a page of unscored video rows, this module decodes each one, and posts the
 * score back. See `docs/MOTION_SCORE_DESIGN.md`.
 */

import { invoke } from "@tauri-apps/api/core";
import { assetUrl } from "./image";
import type { ImageFile } from "../types";
import { computeMotionScore, isValidMotionScore } from "./motion-score";

/** Rows requested per page during a sweep. */
export const MOTION_SWEEP_PAGE_SIZE = 25;

/** How many clips a page is allowed to leave undecodable before moving on. */
export const MOTION_SWEEP_MAX_CONSECUTIVE_FAILURES = 5;

export interface MotionSweepProgress {
  current: number;
  scored: number;
  failed: number;
  currentPath: string;
  done: boolean;
  canceled: boolean;
}

export interface MotionSweepResult {
  scored: number;
  failed: number;
  canceled: boolean;
}

/** Files already attempted this session, so a hover does not retry a bad clip. */
const attempted = new Set<number>();

/** Reset the in-memory record of attempted files (used by tests and resets). */
export function resetMotionScoreAttempts(): void {
  attempted.clear();
}

/**
 * Whether this file is worth an opportunistic scoring attempt.
 *
 * Only unmeasured videos qualify: a stored score is a finished measurement,
 * and an image has nothing to measure. The `attempted` set keeps a clip the
 * platform cannot decode from being re-decoded on every hover.
 */
export function shouldAttemptMotionScore(file: ImageFile | null | undefined): boolean {
  if (!file || file.id == null) return false;
  const container = (file.container ?? "").toLowerCase();
  if (container !== "mp4" && container !== "webm") return false;
  if (file.motion_score != null) return false;
  return !attempted.has(file.id);
}

/**
 * Score one already-mounted video element and persist the result.
 *
 * Returns the score when it was written, or `null` when the clip could not be
 * measured or the file changed underneath the decode. Failures are remembered
 * for the session so the same clip is not retried on every hover.
 */
export async function scoreVideoElement(
  file: ImageFile,
  video: HTMLVideoElement,
  options: { size?: number; count?: number; timeoutMs?: number } = {},
): Promise<number | null> {
  if (file.id == null) return null;
  if (!video.videoWidth || !video.videoHeight) return null;
  if (!Number.isFinite(video.duration) || video.duration <= 0) return null;

  const previousTime = video.currentTime;
  attempted.add(file.id);

  try {
    const canvas = document.createElement("canvas");
    const size = options.size ?? 64;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;

    const score = await computeMotionScore(video, context, {
      size,
      count: options.count,
      timeoutMs: options.timeoutMs,
    });
    if (!isValidMotionScore(score)) return null;

    const stored = await invoke<boolean>("save_video_motion_score", {
      fileId: file.id,
      modifiedAt: file.modified_at,
      motionScore: score,
    });
    // A `false` means the row moved on mid-decode; the score describes bytes
    // that are no longer there, so treat it as unmeasured rather than retrying.
    return stored ? score : null;
  } catch (err) {
    console.debug("Motion scoring failed:", err);
    return null;
  } finally {
    // Restore playback position so scoring is invisible to a hovering user.
    try {
      if (Number.isFinite(previousTime) && previousTime > 0) {
        video.currentTime = previousTime;
      }
    } catch {
      /* the element may have been torn down mid-score */
    }
  }
}

/** One page of videos that still need a score. */
export async function listUnscoredVideos(
  afterId: number | null,
  limit: number = MOTION_SWEEP_PAGE_SIZE,
): Promise<ImageFile[]> {
  return invoke<ImageFile[]>("list_unscored_videos", {
    afterId,
    limit,
  });
}

/**
 * Load a detached video element for `file` and wait until it can be decoded.
 *
 * Resolves `null` rather than rejecting when the clip cannot be loaded, which
 * is the expected outcome for a codec the platform lacks.
 */
export function loadVideoElement(
  file: ImageFile,
  timeoutMs = 10_000,
): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    let settled = false;
    const finish = (result: HTMLVideoElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
      if (!result) {
        video.removeAttribute("src");
        video.load();
      }
      resolve(result);
    };
    const onReady = () => finish(video);
    const onError = () => finish(null);
    const timer = setTimeout(() => finish(null), timeoutMs);

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", onError);
    video.src = assetUrl(file.path);
  });
}

/**
 * Sweep the library for videos that still need a score.
 *
 * Paged by id cursor so it terminates even when some clips never decode; a
 * clip that fails stays `NULL` and is simply skipped once the cursor passes it.
 * `onProgress` is called after every clip so the UI can show a live count.
 */
export async function sweepMotionScores(options: {
  pageSize?: number;
  onProgress?: (progress: MotionSweepProgress) => void;
  shouldContinue?: () => boolean;
  /** Injectable for tests; defaults to the Tauri command. */
  listUnscored?: (afterId: number | null, limit: number) => Promise<ImageFile[]>;
  loadVideo?: (file: ImageFile) => Promise<HTMLVideoElement | null>;
  scoreVideo?: (
    file: ImageFile,
    video: HTMLVideoElement,
  ) => Promise<number | null>;
} = {}): Promise<MotionSweepResult> {
  const pageSize = options.pageSize ?? MOTION_SWEEP_PAGE_SIZE;
  const shouldContinue = options.shouldContinue ?? (() => true);
  const listUnscored = options.listUnscored ?? listUnscoredVideos;
  const loadVideo = options.loadVideo ?? ((file: ImageFile) => loadVideoElement(file));
  const scoreVideo = options.scoreVideo ?? ((file, video) => scoreVideoElement(file, video));

  let cursor: number | null = null;
  let scored = 0;
  let failed = 0;
  let examined = 0;
  let consecutiveFailures = 0;

  const report = (currentPath: string, done: boolean, canceled = false) => {
    options.onProgress?.({
      current: examined,
      scored,
      failed,
      currentPath,
      done,
      canceled,
    });
  };

  for (;;) {
    if (!shouldContinue()) {
      report("", true, true);
      return { scored, failed, canceled: true };
    }

    const page = await listUnscored(cursor, pageSize);
    if (page.length === 0) break;

    // Remember where this page started so a page that advances nothing can be
    // detected, rather than looping forever over the same rows.
    const pageStartCursor: number | null = cursor;

    for (const file of page) {
      if (!shouldContinue()) {
        report("", true, true);
        return { scored, failed, canceled: true };
      }

      examined += 1;
      if (file.id != null) cursor = file.id;

      if (file.id == null || attempted.has(file.id)) {
        // Already tried this session, or not addressable: count it and move on.
        failed += 1;
        consecutiveFailures += 1;
      } else {
        attempted.add(file.id);
        const video = await loadVideo(file);
        if (!video) {
          failed += 1;
          consecutiveFailures += 1;
        } else {
          const score = await scoreVideo(file, video);
          video.removeAttribute("src");
          video.load();
          if (score == null) {
            failed += 1;
            consecutiveFailures += 1;
          } else {
            scored += 1;
            consecutiveFailures = 0;
          }
        }
      }

      report(file.path, false);

      if (consecutiveFailures >= MOTION_SWEEP_MAX_CONSECUTIVE_FAILURES) {
        // A run of failures usually means this machine cannot decode the
        // codecs in this library; stopping beats grinding through thousands of
        // clips that will all fail.
        report("", true);
        return { scored, failed, canceled: false };
      }
    }

    if (cursor == null || cursor === pageStartCursor) {
      // The page could not advance the cursor, so another request would return
      // the same rows. Stop instead of spinning.
      break;
    }
  }

  report("", true);
  return { scored, failed, canceled: false };
}
