import assert from "node:assert/strict";
import test from "node:test";
import { criteriaToQuery, parseSearchQuery } from "../src/utils/search.ts";

test("serializes model hashes without dropping the structured filter", () => {
  assert.equal(criteriaToQuery({ model_hash: "abc12345" }), "hash:abc12345");
  assert.equal(criteriaToQuery({ model_hash: "hash with spaces" }), 'hash:"hash with spaces"');
});

test("serializes video search criteria correctly", () => {
  assert.equal(criteriaToQuery({ media_type: "video" }), "type:video");
  assert.equal(criteriaToQuery({ min_duration: 5, max_duration: 15 }), "duration:5..15");
  assert.equal(criteriaToQuery({ min_duration: 10 }), "duration:>=10");
  assert.equal(criteriaToQuery({ max_duration: 60 }), "duration:<=60");
  assert.equal(criteriaToQuery({ min_fps: 30, max_fps: 60 }), "fps:30..60");
  assert.equal(criteriaToQuery({ min_fps: 24 }), "fps:>=24");
});

test("serializes video resolution and codec criteria", () => {
  assert.equal(criteriaToQuery({ min_width: 1920 }), "width:>=1920");
  assert.equal(criteriaToQuery({ max_width: 1920 }), "width:<=1920");
  assert.equal(criteriaToQuery({ min_width: 1280, max_width: 1920 }), "width:1280..1920");
  assert.equal(criteriaToQuery({ min_width: 1920, max_width: 1920 }), "width:1920");
  assert.equal(criteriaToQuery({ min_height: 720 }), "height:>=720");
  assert.equal(criteriaToQuery({ min_height: 720, max_height: 1080 }), "height:720..1080");
  assert.equal(criteriaToQuery({ video_codec: "h264" }), "codec:h264");
});

test("round-trips video resolution and codec through the query string", () => {
  const query = criteriaToQuery({
    min_width: 1280,
    max_width: 1920,
    min_height: 720,
    video_codec: "av1",
  });
  const parsed = parseSearchQuery(query);
  assert.equal(parsed.min_width, 1280);
  assert.equal(parsed.max_width, 1920);
  assert.equal(parsed.min_height, 720);
  assert.equal(parsed.video_codec, "av1");
});

test("normalizes codec tokens and rounds resolution to whole pixels", () => {
  const parsed = parseSearchQuery("codec:HEVC width:>=1919.6 height:1.5..719.4");
  assert.equal(parsed.video_codec, "hevc");
  assert.equal(parsed.min_width, 1920);
  assert.equal(parsed.min_height, 2);
  assert.equal(parsed.max_height, 719);
});

test("parses structured tokens and freeform text via parseSearchQuery", () => {
  const criteria = parseSearchQuery('cyberpunk rainy street model:"SDXL Turbo" rating:>=5 fav:true steps:20..40');
  assert.equal(criteria.text, "cyberpunk rainy street");
  assert.equal(criteria.model_name, "SDXL Turbo");
  assert.equal(criteria.min_rating, 5);
  assert.equal(criteria.is_favorite, true);
  assert.equal(criteria.min_steps, 20);
  assert.equal(criteria.max_steps, 40);
});

test("criteriaToQuery preserves freeform text keyword when present", () => {
  const query = criteriaToQuery({
    text: "cyberpunk rainy street",
    model_name: "SDXL",
    min_rating: 4,
  });
  assert.ok(query.includes("cyberpunk rainy street"));
  assert.ok(query.includes("model:SDXL"));
  assert.ok(query.includes("rating:>=4"));
});

