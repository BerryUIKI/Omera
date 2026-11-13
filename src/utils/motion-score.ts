/**
 * Motion scoring for video assets.
 *
 * The score is derived from decoded pixels, which this application only ever
 * has inside the WebView: file paths are served over the `asset:` protocol and
 * the configured folders are granted through `asset_protocol_scope`, so a
 * `<video>` element is same-origin with the page and its frames can be read
 * back from a canvas. There is no Rust-side video decoder.
 *
 * This module splits into two layers on purpose:
 *
 * - {@link meanAbsoluteDifference} and {@link framesToScore} are pure. They
 *   take plain grayscale buffers and are unit-tested against synthetic frames.
 * - {@link captureGrayscaleFrames} and {@link computeMotionScore} touch the DOM
 *   and are exercised only through the app.
 *
 * See `docs/MOTION_SCORE_DESIGN.md` for the algorithm and its trade-offs.
 */

/** Side length, in pixels, of the square grayscale buffer a frame is reduced to. */
export const MOTION_FRAME_SIZE = 64;

/** Number of frames sampled across a clip. */
export const MOTION_SAMPLE_COUNT = 8;

/**
 * Difference below this is treated as no motion at all.
 *
 * Near-static footage still moves a little under compression: grain and block
 * boundaries shift between frames even when nothing in the scene does. Without
 * a dead zone those clips score a few points instead of zero, and "still"
 * stops meaning still.
 */
export const MOTION_DEAD_ZONE = 0.02;

/** Upper bound of the 0–100 score. */
export const MOTION_SCORE_MAX = 100;

/** Fractional positions across the clip, each offset into the middle of its slice. */
export function sampleOffsets(count: number = MOTION_SAMPLE_COUNT): number[] {
  if (!Number.isFinite(count) || count < 1) return [];
  const n = Math.floor(count);
  return Array.from({ length: n }, (_, k) => (k + 0.5) / n);
}

/**
 * Mean absolute difference between two equally sized grayscale buffers, in 0..1.
 *
 * Both per-frame level and the shared spatial change are removed first:
 *
 * - Subtracting each frame's mean keeps a global brightness ramp (a fade) from
 *   counting as motion, since every pixel shifts equally and nothing in the
 *   image actually moves.
 * - Subtracting the mean of the difference itself removes whatever residual
 *   net drift survives that, leaving only spatially varying change.
 *
 * Returns 0 when the buffers disagree in length or contain non-finite values,
 * because an unreadable frame is not evidence of motion.
 */
export function meanAbsoluteDifference(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return 0;
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / a.length;
  const meanB = sumB / b.length;

  let sumDiff = 0;
  for (let i = 0; i < a.length; i++) {
    sumDiff += a[i] - meanA - (b[i] - meanB);
  }
  const meanDiff = sumDiff / a.length;

  let total = 0;
  for (let i = 0; i < a.length; i++) {
    total += Math.abs(a[i] - meanA - (b[i] - meanB) + meanDiff);
  }
  // Buffers hold 0..255 samples; normalize to 0..1 so the score scale does not
  // depend on the bit depth the canvas happened to give us.
  return total / a.length / 255;
}

/** Map a raw 0..1 motion magnitude onto the 0–100 facet scale. */
export function framesToScore(motion: number): number {
  if (!Number.isFinite(motion) || motion <= MOTION_DEAD_ZONE) return 0;
  // Normalize past the dead zone so the band right above "still" has usable
  // resolution instead of being a thin sliver of the 0..100 range.
  const scaled = ((motion - MOTION_DEAD_ZONE) / (1 - MOTION_DEAD_ZONE)) * MOTION_SCORE_MAX;
  // Ceiling, not rounding: anything past the dead zone is motion, and rounding
  // would collapse a barely-moving clip back to 0 and make "still" a lie.
  return Math.ceil(Math.max(1, Math.min(MOTION_SCORE_MAX, scaled)));
}

/**
 * Score a sequence of grayscale frames on the 0–100 scale.
 *
 * Needs at least two frames: a single frame says nothing about motion, and
 * inventing a score for it would put an unmeasured clip in a filter result.
 * Returns `null` in that case so the caller can leave the row unmeasured.
 */
export function scoreGrayscaleFrames(frames: Array<ArrayLike<number>>): number | null {
  if (!Array.isArray(frames) || frames.length < 2) return null;

  let total = 0;
  let pairs = 0;
  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];
    if (prev.length !== curr.length || curr.length === 0) continue;
    total += meanAbsoluteDifference(prev, curr);
    pairs += 1;
  }
  if (pairs === 0) return null;

  return framesToScore(total / pairs);
}

/**
 * Whether a score returned by this module is one the backend will accept.
 *
 * M3 clamps again on the Rust side; this keeps the WebView from proposing
 * something obviously out of range in the first place.
 */
export function isValidMotionScore(score: number | null | undefined): score is number {
  return (
    typeof score === "number" &&
    Number.isFinite(score) &&
    score >= 0 &&
    score <= MOTION_SCORE_MAX
  );
}

/**
 * Sample positions, in seconds, at which to read frames from a clip.
 *
 * A clip too short to be walked is sampled once from its start rather than
 * dropped: one frame is not enough to score, but the caller can still tell the
 * difference between "too short" and "decoding failed".
 */
export function sampleTimes(durationSeconds: number, count: number = MOTION_SAMPLE_COUNT): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  return sampleOffsets(count).map((offset) => offset * durationSeconds);
}

/** A decoded frame reduced to the canonical square grayscale buffer. */
export type GrayscaleFrame = Uint8ClampedArray;

/**
 * Reduce an RGBA pixel buffer to the canonical square grayscale buffer.
 *
 * Extracted so the downsampling rule is testable without a canvas. Pixels are
 * averaged over their destination cell, which both low-passes the frame -- the
 * property that makes the score resolution-independent -- and makes the result
 * insensitive to the source aspect ratio: a 16:9 clip is squeezed into the
 * square, which changes nothing about how much its content moves.
 */
export function rgbaToGrayscaleFrame(
  rgba: ArrayLike<number>,
  sourceWidth: number,
  sourceHeight: number,
  size: number = MOTION_FRAME_SIZE,
): GrayscaleFrame | null {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth < 1 ||
    sourceHeight < 1 ||
    !Number.isFinite(size) ||
    size < 1
  ) {
    return null;
  }
  const w = Math.floor(sourceWidth);
  const h = Math.floor(sourceHeight);
  const n = Math.floor(size);
  if (rgba.length < w * h * 4) return null;

  const out = new Uint8ClampedArray(n * n);
  const cellWidth = w / n;
  const cellHeight = h / n;

  for (let ty = 0; ty < n; ty++) {
    const y0 = Math.floor(ty * cellHeight);
    const y1 = Math.max(y0 + 1, Math.floor((ty + 1) * cellHeight));
    for (let tx = 0; tx < n; tx++) {
      const x0 = Math.floor(tx * cellWidth);
      const x1 = Math.max(x0 + 1, Math.floor((tx + 1) * cellWidth));

      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1 && y < h; y++) {
        const rowOffset = y * w * 4;
        for (let x = x0; x < x1 && x < w; x++) {
          const i = rowOffset + x * 4;
          // Rec. 601 luma: the same weighting a `grayscale(1)` CSS filter uses.
          sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
          count += 1;
        }
      }
      out[ty * n + tx] = count > 0 ? sum / count : 0;
    }
  }
  return out;
}

/** The slice of `HTMLVideoElement` this module reads. */
export interface DecodableVideo {
  readonly duration: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
  currentTime: number;
  readonly readyState: number;
}

/** The slice of `CanvasRenderingContext2D` this module reads. */
export interface FrameReadContext {
  drawImage(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray; width: number; height: number };
}

/**
 * Decode `count` frames from a video and reduce them to grayscale buffers.
 *
 * Every failure mode returns `null` rather than a score: an element that never
 * becomes playable, a clip with no finite duration, a seek that does not land,
 * or a canvas read that throws. The WebView decodes with whatever codecs the
 * operating system provides, so a clip this machine cannot play must stay
 * unmeasured instead of being recorded as still.
 */
export async function captureGrayscaleFrames(
  video: DecodableVideo,
  context: FrameReadContext,
  options: { count?: number; size?: number; timeoutMs?: number } = {},
): Promise<GrayscaleFrame[] | null> {
  const size = options.size ?? MOTION_FRAME_SIZE;
  const timeoutMs = options.timeoutMs ?? 2000;

  if (!Number.isFinite(video.duration) || video.duration <= 0) return null;
  if (!video.videoWidth || !video.videoHeight) return null;

  const times = sampleTimes(video.duration, options.count ?? MOTION_SAMPLE_COUNT);
  if (times.length === 0) return null;

  const frames: GrayscaleFrame[] = [];
  for (const time of times) {
    const landed = await seekTo(video, time, timeoutMs);
    if (!landed) return null;

    try {
      context.drawImage(video as unknown as CanvasImageSource, 0, 0, video.videoWidth, video.videoHeight, 0, 0, size, size);
      const image = context.getImageData(0, 0, size, size);
      const frame = rgbaToGrayscaleFrame(image.data, image.width, image.height, size);
      if (!frame) return null;
      frames.push(frame);
    } catch {
      return null;
    }
  }
  return frames;
}

/**
 * Move the element to `time` and wait until a frame for that position is ready.
 *
 * Resolves `false` on timeout so a stalled decode cannot hang the caller. The
 * listener is removed on every exit path, including the timeout.
 */
export function seekTo(video: DecodableVideo, time: number, timeoutMs: number): Promise<boolean> {
  const target = Math.max(0, Math.min(time, Number.isFinite(video.duration) ? video.duration : time));
  const element = video as unknown as {
    addEventListener?: (type: string, listener: () => void, options?: { once?: boolean }) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
  };
  if (typeof element.addEventListener !== "function") {
    // Nothing to wait on (a test double, for instance): seek and report success.
    video.currentTime = target;
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      element.removeEventListener?.("seeked", onSeeked);
      element.removeEventListener?.("error", onError);
      resolve(ok);
    };
    const onSeeked = () => finish(true);
    const onError = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);

    element.addEventListener?.("seeked", onSeeked, { once: true });
    element.addEventListener?.("error", onError, { once: true });
    video.currentTime = target;
  });
}

/**
 * Score a video end to end, or `null` when it cannot be measured.
 *
 * `context` is created by the caller so the canvas size can be set once and
 * reused across clips; scoring is a batch operation and allocating a canvas
 * per file would be needless churn.
 */
export async function computeMotionScore(
  video: DecodableVideo,
  context: FrameReadContext,
  options: { count?: number; size?: number; timeoutMs?: number } = {},
): Promise<number | null> {
  const frames = await captureGrayscaleFrames(video, context, options);
  if (!frames) return null;
  return scoreGrayscaleFrames(frames);
}
