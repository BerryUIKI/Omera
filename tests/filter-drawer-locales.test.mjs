import assert from "node:assert/strict";
import test from "node:test";
import { en } from "../src/i18n/locales/en.ts";
import { de } from "../src/i18n/locales/de.ts";
import { es } from "../src/i18n/locales/es.ts";
import { fr } from "../src/i18n/locales/fr.ts";
import { ja } from "../src/i18n/locales/ja.ts";
import { zhCN } from "../src/i18n/locales/zh-CN.ts";
import { zhTW } from "../src/i18n/locales/zh-TW.ts";

const CATALOGS = { "zh-CN": zhCN, "zh-TW": zhTW, en, ja, de, fr, es };

test("every locale supplies the video resolution and codec filter keys", () => {
  const required = [
    "resolutionLabel",
    "minWidthPlaceholder",
    "maxWidthPlaceholder",
    "minHeightPlaceholder",
    "maxHeightPlaceholder",
    "codecLabel",
    "anyCodec",
    "resolutionSdTitle",
    "resolutionHdTitle",
    "resolutionFullHdTitle",
    "resolution4kTitle",
  ];

  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    for (const key of required) {
      const value = catalog.filterDrawer[key];
      assert.equal(
        typeof value,
        "string",
        `${locale}.filterDrawer.${key} is missing`,
      );
      assert.ok(
        value.trim().length > 0,
        `${locale}.filterDrawer.${key} is empty`,
      );
    }
  }
});

test("filter drawer keys stay in parity across locales", () => {
  const reference = Object.keys(en.filterDrawer).sort();
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    assert.deepEqual(
      Object.keys(catalog.filterDrawer).sort(),
      reference,
      `${locale}.filterDrawer diverges from en`,
    );
  }
});
