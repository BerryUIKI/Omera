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

const REQUIRED = [
  "motionScan",
  "motionScanDesc",
  "motionScanStart",
  "motionScanStop",
  "motionScanCanceled",
  "motionScanScored",
  "motionScanFailed",
];

test("every locale supplies the motion scan settings keys", () => {
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    for (const key of REQUIRED) {
      const value = catalog.settings[key];
      assert.equal(
        typeof value,
        "string",
        `${locale}.settings.${key} is missing`,
      );
      assert.ok(
        value.trim().length > 0,
        `${locale}.settings.${key} is empty`,
      );
    }
  }
});
