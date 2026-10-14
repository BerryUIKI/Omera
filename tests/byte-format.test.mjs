import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes } from "../src/utils/image.ts";

test("storage sizes use bounded units through exabytes", () => {
  for (const [bytes, expected] of [
    [0, "0 B"], [1023, "1023 B"], [1024, "1.0 KB"],
    [1024 ** 2, "1.0 MB"], [1024 ** 3, "1.0 GB"],
    [1.5 * 1024 ** 4, "1.5 TB"], [1024 ** 5, "1.0 PB"],
    [1024 ** 6, "1.0 EB"],
  ]) assert.equal(formatBytes(bytes), expected);
});

test("invalid byte measurements are displayed as unavailable", () => {
  for (const value of [-1, NaN, Infinity]) assert.equal(formatBytes(value), "—");
});
