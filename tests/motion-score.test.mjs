import assert from "node:assert/strict";
import test from "node:test";
import {
  MOTION_DEAD_ZONE,
  MOTION_FRAME_SIZE,
  MOTION_SAMPLE_COUNT,
  MOTION_SCORE_MAX,
  captureGrayscaleFrames,
  computeMotionScore,
  framesToScore,
  isValidMotionScore,
  meanAbsoluteDifference,
  rgbaToGrayscaleFrame,
  sampleOffsets,
  sampleTimes,
  scoreGrayscaleFrames,
  seekTo,
} from "../src/utils/motion-score.ts";

/** A square gray frame filled with a single value. */
function flat(value, size = MOTION_FRAME_SIZE) {
  return new Uint8ClampedArray(size * size).fill(value);
}

/** Left half one value, right half another — a frame with structure. */
function split(left, right, size = MOTION_FRAME_SIZE) {
  const frame = new Uint8ClampedArray(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      frame[y * size + x] = x < size / 2 ? left : right;
    }
  }
  return frame;
}

/** Alternating stripes, shifted horizontally — a cheap stand-in for motion. */
function stripes(shift, size = MOTION_FRAME_SIZE) {
  const frame = new Uint8ClampedArray(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      frame[y * size + x] = (Math.floor((x + shift) / 8) % 2 === 0) ? 0 : 255;
    }
  }
  return frame;
}

test("sample positions are evenly spaced, half-step offset, and in order", () => {
  const offsets = sampleOffsets(4);
  assert.deepEqual(offsets, [0.125, 0.375, 0.625, 0.875]);
  assert.equal(sampleOffsets(0).length, 0);
  assert.equal(sampleOffsets(-1).length, 0);
  assert.equal(sampleOffsets(Number.NaN).length, 0);
  assert.equal(sampleOffsets(2.7).length, 2, "fractional counts floor");

  const defaults = sampleOffsets();
  assert.equal(defaults.length, MOTION_SAMPLE_COUNT);
  // Never 0: the first frame of a generated clip is often a black lead-in.
  assert.ok(defaults[0] > 0);
  assert.ok(defaults[defaults.length - 1] < 1);
});

test("sampled times span the clip without touching either end", () => {
  assert.deepEqual(sampleTimes(10, 2), [2.5, 7.5]);
  assert.deepEqual(sampleTimes(0), []);
  assert.deepEqual(sampleTimes(-5), []);
  assert.deepEqual(sampleTimes(Number.POSITIVE_INFINITY), []);
  for (const t of sampleTimes(3.2)) assert.ok(t > 0 && t < 3.2);
});

test("identical frames have no motion", () => {
  assert.equal(meanAbsoluteDifference(split(20, 240), split(20, 240)), 0);
  assert.equal(meanAbsoluteDifference(flat(128), flat(128)), 0);
});

test("a uniform brightness ramp is not motion", () => {
  // Every pixel rises equally: a fade, which the eye reads as no movement.
  const before = flat(40);
  const after = flat(160);
  assert.equal(meanAbsoluteDifference(before, after), 0);

  const structuredBright = split(60, 200);
  const structuredDark = split(20, 160);
  assert.ok(
    meanAbsoluteDifference(structuredBright, structuredDark) < MOTION_DEAD_ZONE,
    "a pure level shift must stay inside the dead zone",
  );
});

test("spatial change registers as motion and scales with the amount", () => {
  const still = split(20, 240);
  const small = split(60, 200);
  const large = split(120, 140);

  const smallMotion = meanAbsoluteDifference(still, small);
  const largeMotion = meanAbsoluteDifference(still, large);

  assert.ok(smallMotion > 0);
  assert.ok(largeMotion > smallMotion, "more displacement scores higher");
  assert.ok(largeMotion <= 1, "magnitude is normalized");
});

test("a hard cut scores near the top of the scale", () => {
  const score = framesToScore(meanAbsoluteDifference(stripes(0), stripes(8)));
  assert.ok(score > 80, `expected a high score for a full inversion, got ${score}`);
  assert.ok(score <= MOTION_SCORE_MAX);
});

test("the dead zone clamps near-static footage to exactly zero", () => {
  assert.equal(framesToScore(0), 0);
  assert.equal(framesToScore(MOTION_DEAD_ZONE), 0);
  assert.equal(framesToScore(MOTION_DEAD_ZONE / 2), 0);
  assert.equal(framesToScore(-1), 0);
  assert.equal(framesToScore(Number.NaN), 0);
  assert.equal(framesToScore(Number.POSITIVE_INFINITY), 0);
  assert.ok(framesToScore(MOTION_DEAD_ZONE + 0.001) > 0);
});

test("scores are clamped to the facet range and rounded to integers", () => {
  assert.equal(framesToScore(1), MOTION_SCORE_MAX);
  assert.equal(framesToScore(5), MOTION_SCORE_MAX);
  for (const value of [0.05, 0.17, 0.42, 0.83, 1]) {
    const score = framesToScore(value);
    assert.equal(Number.isInteger(score), true);
    assert.ok(score >= 0 && score <= MOTION_SCORE_MAX);
  }
});

test("scoring needs at least two readable frames", () => {
  assert.equal(scoreGrayscaleFrames([]), null);
  assert.equal(scoreGrayscaleFrames([flat(10)]), null, "one frame says nothing about motion");
  assert.equal(scoreGrayscaleFrames(null), null);
  assert.equal(scoreGrayscaleFrames(undefined), null);
  assert.equal(scoreGrayscaleFrames([flat(10), new Uint8ClampedArray(0)]), null, "mismatched frames are skipped");
});

test("a static clip scores zero while a moving clip scores higher", () => {
  const staticScore = scoreGrayscaleFrames([split(20, 240), split(20, 240), split(20, 240)]);
  assert.equal(staticScore, 0);

  const movingScore = scoreGrayscaleFrames([stripes(0), stripes(4), stripes(8), stripes(12)]);
  assert.ok(movingScore !== null);
  assert.ok(movingScore > 10, `moving clip should register, got ${movingScore}`);
});

test("a single instantaneous cut cannot dominate the average", () => {
  const still = split(20, 240);
  const moved = split(180, 80);
  // Eight samples, one of them a cut: at most one seventh of the pairs differ.
  const mostlyStill = scoreGrayscaleFrames([still, still, still, still, moved, still, still, still]);
  const constantlyMoving = scoreGrayscaleFrames([moved, still, moved, still, moved, still, moved, still]);
  assert.ok(mostlyStill !== null && constantlyMoving !== null);
  assert.ok(mostlyStill < constantlyMoving);
});

test("scores are independent of the sampled frame resolution", () => {
  // The same structural change at 32 and at 128 must agree within a few points.
  const at = (size) =>
    framesToScore(meanAbsoluteDifference(split(20, 240, size), split(120, 140, size)));
  const small = at(32);
  const large = at(128);
  assert.ok(Math.abs(small - large) <= 2, `expected parity, got ${small} vs ${large}`);
});

test("RGBA frames reduce to the canonical square grayscale buffer", () => {
  const width = 16;
  const height = 9;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 255;     // red
    rgba[i + 1] = 0;
    rgba[i + 2] = 0;
    rgba[i + 3] = 255;
  }

  const frame = rgbaToGrayscaleFrame(rgba, width, height, 8);
  assert.ok(frame instanceof Uint8ClampedArray);
  assert.equal(frame.length, 8 * 8);
  // Pure red under Rec. 601 luma is 0.299 * 255 ≈ 76.
  for (const value of frame) assert.ok(Math.abs(value - 76) <= 1);

  // A 16:9 source and a 1:1 source of the same flat colour agree.
  const square = new Uint8ClampedArray(8 * 8 * 4).fill(255);
  const fromSquare = rgbaToGrayscaleFrame(square, 8, 8, 8);
  for (const value of fromSquare) assert.equal(value, 255);
});

test("RGBA reduction rejects unusable input instead of guessing", () => {
  assert.equal(rgbaToGrayscaleFrame(new Uint8ClampedArray(0), 0, 0, 8), null);
  assert.equal(rgbaToGrayscaleFrame(new Uint8ClampedArray(4), 8, 8, 8), null, "short buffer");
  assert.equal(rgbaToGrayscaleFrame(new Uint8ClampedArray(256), 8, 8, 0), null);
  assert.equal(rgbaToGrayscaleFrame(new Uint8ClampedArray(256), Number.NaN, 8, 8), null);
});

test("a decodable video yields a score through the canvas path", async () => {
  const video = { duration: 8, videoWidth: 320, videoHeight: 240, currentTime: 0, readyState: 4 };
  let call = 0;
  const context = {
    drawImage() {},
    getImageData(_x, _y, w, h) {
      // Alternate between two structurally different frames so motion shows up.
      const data = new Uint8ClampedArray(w * h * 4);
      // Half a stripe period: a full period would land on identical pixels and
      // the sampled frames would be indistinguishable.
      const shift = call++ % 2 === 0 ? 0 : 2;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const value = (Math.floor((x + shift) / 4) % 2 === 0) ? 0 : 255;
          const i = (y * w + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = value;
          data[i + 3] = 255;
        }
      }
      return { data, width: w, height: h };
    },
  };

  const score = await computeMotionScore(video, context, { count: 4, size: 16 });
  assert.ok(score !== null, "a playable clip must produce a score");
  assert.ok(isValidMotionScore(score));
  assert.ok(score > 0);
});

test("an unplayable clip stays unmeasured instead of scoring zero", async () => {
  const context = { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(0), width: 0, height: 0 }) };

  const noDuration = { duration: Number.POSITIVE_INFINITY, videoWidth: 320, videoHeight: 240, currentTime: 0, readyState: 0 };
  assert.equal(await computeMotionScore(noDuration, context), null);

  const noGeometry = { duration: 5, videoWidth: 0, videoHeight: 0, currentTime: 0, readyState: 0 };
  assert.equal(await computeMotionScore(noGeometry, context), null);

  const zeroLength = { duration: 0, videoWidth: 320, videoHeight: 240, currentTime: 0, readyState: 0 };
  assert.equal(await computeMotionScore(zeroLength, context), null);
});

test("a canvas read that throws abandons the measurement", async () => {
  const video = { duration: 5, videoWidth: 16, videoHeight: 16, currentTime: 0, readyState: 4 };
  const context = {
    drawImage() {
      throw new Error("tainted canvas");
    },
    getImageData: () => ({ data: new Uint8ClampedArray(0), width: 0, height: 0 }),
  };
  assert.equal(await computeMotionScore(video, context), null);
});

test("a seek that never lands times out instead of hanging", async () => {
  const listeners = new Map();
  const video = {
    duration: 10,
    videoWidth: 16,
    videoHeight: 16,
    currentTime: 0,
    readyState: 2,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };

  const started = process.hrtime.bigint();
  const result = await seekTo(video, 5, 40);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  assert.equal(result, false);
  assert.ok(elapsedMs >= 30, `should wait for the timeout, waited ${elapsedMs}ms`);
  assert.equal(listeners.size, 0, "listeners are released on timeout");
});

test("a landed seek resolves true and releases its listeners", async () => {
  let handler;
  const video = {
    duration: 10,
    videoWidth: 16,
    videoHeight: 16,
    currentTime: 0,
    readyState: 2,
    addEventListener(type, listener) { if (type === "seeked") handler = listener; },
    removeEventListener() {},
  };

  const pending = seekTo(video, 3, 1000);
  assert.equal(video.currentTime, 3, "the seek is issued before awaiting");
  handler();
  assert.equal(await pending, true);
});

test("validity check rejects out-of-range and non-finite scores", () => {
  assert.equal(isValidMotionScore(0), true);
  assert.equal(isValidMotionScore(100), true);
  assert.equal(isValidMotionScore(50.5), true);
  assert.equal(isValidMotionScore(-1), false);
  assert.equal(isValidMotionScore(101), false);
  assert.equal(isValidMotionScore(Number.NaN), false);
  assert.equal(isValidMotionScore(Number.POSITIVE_INFINITY), false);
  assert.equal(isValidMotionScore(null), false);
  assert.equal(isValidMotionScore(undefined), false);
  assert.equal(isValidMotionScore("42"), false);
});
