/**
 * tests/i18n.test.js
 * Unit tests for the SafePost i18n module.
 */

import { describe, it } from "node:test";
import assert from "node:assert";

await import("../core/i18n.js");

const { SafePostI18n } = globalThis;

describe("SafePostI18n", () => {
  it("defaults to Vietnamese", () => {
    const i18n = new SafePostI18n();
    assert.strictEqual(i18n.lang, "vi");
    assert.strictEqual(i18n.t("saveButton"), "Lưu cài đặt");
  });

  it("switches to English", () => {
    const i18n = new SafePostI18n("en");
    assert.strictEqual(i18n.lang, "en");
    assert.strictEqual(i18n.t("saveButton"), "Save Settings");
  });

  it("falls back to default for unsupported language", () => {
    const i18n = new SafePostI18n("fr");
    assert.strictEqual(i18n.lang, "vi");
  });

  it("interpolates variables", () => {
    const i18n = new SafePostI18n("vi");
    assert.strictEqual(
      i18n.t("settingsError", { message: "bad" }),
      "Lỗi: bad"
    );
  });

  it("returns severity labels", () => {
    const vi = new SafePostI18n("vi");
    assert.strictEqual(vi.severity("high"), "Cao");

    const en = new SafePostI18n("en");
    assert.strictEqual(en.severity("high"), "High");
  });

  it("returns category labels", () => {
    const vi = new SafePostI18n("vi");
    assert.strictEqual(vi.category("doxxing"), "Lộ thông tin cá nhân");

    const en = new SafePostI18n("en");
    assert.strictEqual(en.category("doxxing"), "Personal information exposure");
    assert.strictEqual(en.category("unknown_category"), "Other");
  });

  it("can change language after construction", () => {
    const i18n = new SafePostI18n("vi");
    i18n.setLanguage("en");
    assert.strictEqual(i18n.t("advisoryTitle"), "Warning before posting");
  });
});
