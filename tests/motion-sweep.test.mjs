import assert from "node:assert/strict";
import test from "node:test";
import {
  MOTION_SWEEP_MAX_CONSECUTIVE_FAILURES,
  MOTION_SWEEP_PAGE_SIZE,
  resetMotionScoreAttempts,
  shouldAttemptMotionScore,
  sweepMotionScores,
} from "../src/utils/motion-sweep.ts";

/** A minimal ImageFile shaped the way the sweep uses it. */
function videoFile(id, path, extra = {}) {
  return {
    id,
    folder_id: 1,
    path,
    size_bytes: 1,
    modified_at: 100,
    container: "Mp4",
    metadata: null,
    ...extra,
  };
}

/** A stand-in for a mounted HTMLVideoElement. */
function stubVideo() {
  return { removeAttribute() {}, load() {} };
}

test("only unmeasured videos are candidates for opportunistic scoring", () => {
  assert.equal(shouldAttemptMotionScore(null), false);
  assert.equal(shouldAttemptMotionScore(undefined), false);
  assert.equal(shouldAttemptMotionScore(videoFile(null, "/a.mp4")), false, "no id yet");
  assert.equal(shouldAttemptMotionScore(videoFile(1, "/a.mp4")), true);

  // Images have nothing to measure.
  assert.equal(shouldAttemptMotionScore(videoFile(2, "/a.png", { container: "Png" })), false);

  // A stored score is a finished measurement.
  assert.equal(shouldAttemptMotionScore(videoFile(3, "/a.mp4", { motion_score: 0 })), false);
  assert.equal(shouldAttemptMotionScore(videoFile(4, "/a.mp4", { motion_score: 42 })), false);

  // WebM is a video too.
  assert.equal(shouldAttemptMotionScore(videoFile(5, "/a.webm", { container: "Webm" })), true);
});

test("a file that already failed is not attempted again", async () => {
  resetMotionScoreAttempts();
  const file = videoFile(7, "/a.mp4");
  assert.equal(shouldAttemptMotionScore(file), true);

  let loads = 0;
  await sweepMotionScores({
    pageSize: 10,
    listUnscored: async (afterId) => (afterId == null ? [file] : []),
    loadVideo: async () => {
      loads += 1;
      return null; // decode fails
    },
    scoreVideo: async () => null,
  });
  assert.equal(loads, 1);

  // Second sweep: the clip already failed this session.
  assert.equal(shouldAttemptMotionScore(file), false);
  resetMotionScoreAttempts();
});

test("a sweep scores what it can and counts what it cannot", async () => {
  resetMotionScoreAttempts();
  const files = [
    videoFile(1, "/a.mp4"),
    videoFile(2, "/b.mp4"),
    videoFile(3, "/c.mp4"),
  ];

  const progress = [];
  const result = await sweepMotionScores({
    pageSize: 10,
    listUnscored: async (afterId) =>
      afterId == null ? files : [],
    loadVideo: async (file) => (file.id === 2 ? null : stubVideo()),
    scoreVideo: async () => 40,
    onProgress: (p) => progress.push(p),
  });

  assert.equal(result.scored, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.canceled, false);
  assert.ok(progress.length > 0);
  assert.equal(progress[progress.length - 1].done, true);
  resetMotionScoreAttempts();
});

test("the sweep pages by id cursor and terminates on an empty page", async () => {
  resetMotionScoreAttempts();
  const calls = [];
  const all = [
    videoFile(1, "/a.mp4"),
    videoFile(2, "/b.mp4"),
    videoFile(3, "/c.mp4"),
    videoFile(4, "/d.mp4"),
  ];

  await sweepMotionScores({
    pageSize: 2,
    listUnscored: async (afterId, limit) => {
      calls.push({ afterId, limit });
      const start = afterId ?? 0;
      return all.filter((f) => f.id > start).slice(0, limit);
    },
    loadVideo: async () => stubVideo(),
    scoreVideo: async () => 10,
  });

  // Three page requests: two full pages then an empty one.
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((c) => c.afterId),
    [null, 2, 4],
  );
  assert.ok(calls.every((c) => c.limit === 2));
  resetMotionScoreAttempts();
});

test("a page that cannot advance the cursor stops the sweep", async () => {
  resetMotionScoreAttempts();
  let calls = 0;
  const stuck = videoFile(null, "/no-id.mp4"); // id is null, so the cursor cannot move

  const result = await sweepMotionScores({
    pageSize: 5,
    listUnscored: async () => {
      calls += 1;
      return calls > 5 ? [] : [stuck];
    },
    loadVideo: async () => stubVideo(),
    scoreVideo: async () => 10,
  });

  assert.equal(result.scored, 0);
  assert.ok(calls <= 2, `expected the sweep to stop, made ${calls} page requests`);
  resetMotionScoreAttempts();
});

test("cancellation stops the sweep between clips", async () => {
  resetMotionScoreAttempts();
  const files = Array.from({ length: 6 }, (_, i) => videoFile(i + 1, `/f${i}.mp4`));
  let processed = 0;
  let allow = true;

  const result = await sweepMotionScores({
    pageSize: 10,
    shouldContinue: () => allow,
    listUnscored: async () => files,
    loadVideo: async () => stubVideo(),
    scoreVideo: async () => {
      processed += 1;
      if (processed === 2) allow = false;
      return 30;
    },
  });

  assert.equal(result.canceled, true);
  assert.equal(result.scored, 2);
  assert.ok(processed < files.length, "the sweep stopped early");
  resetMotionScoreAttempts();
});

test("a run of decode failures stops the sweep instead of grinding", async () => {
  resetMotionScoreAttempts();
  const files = Array.from({ length: 50 }, (_, i) => videoFile(i + 1, `/f${i}.mp4`));
  let loads = 0;

  const result = await sweepMotionScores({
    pageSize: 50,
    listUnscored: async () => files,
    loadVideo: async () => {
      loads += 1;
      return null;
    },
    scoreVideo: async () => null,
  });

  assert.equal(result.scored, 0);
  assert.equal(result.failed, MOTION_SWEEP_MAX_CONSECUTIVE_FAILURES);
  assert.equal(loads, MOTION_SWEEP_MAX_CONSECUTIVE_FAILURES, "it stops after the threshold");
  resetMotionScoreAttempts();
});

test("a success resets the consecutive-failure counter", async () => {
  resetMotionScoreAttempts();
  // Fail, fail, succeed, fail, fail, succeed — never reaches the threshold.
  const outcomes = [null, null, 10, null, null, 10];
  const files = outcomes.map((_, i) => videoFile(i + 1, `/f${i}.mp4`));
  const scores = [...outcomes];

  const result = await sweepMotionScores({
    pageSize: 10,
    listUnscored: async (afterId) =>
      files.filter((f) => f.id > (afterId ?? 0)),
    loadVideo: async () => stubVideo(),
    scoreVideo: async () => scores.shift(),
  });

  assert.equal(result.scored, 2);
  assert.equal(result.failed, 4);
  resetMotionScoreAttempts();
});

test("page size defaults are exported for the UI to show progress", () => {
  assert.ok(MOTION_SWEEP_PAGE_SIZE > 0);
  assert.ok(MOTION_SWEEP_MAX_CONSECUTIVE_FAILURES > 0);
});
