import assert from "node:assert";
import test from "node:test";
import "../core/rules.js";

const { RulesEngine } = globalThis;

test("RulesEngine is registered on globalThis", () => {
  assert.ok(RulesEngine, "RulesEngine should be attached to globalThis");
});

test("scan returns no risks for safe text", () => {
  const engine = new RulesEngine(2);
  const result = engine.scan("Hôm nay trờii đẹp, mình đi cà phê.");
  assert.strictEqual(result.overallRisk, "none");
  assert.strictEqual(result.risks.length, 0);
});

test("scan detects cybersecurity-law keywords", () => {
  const engine = new RulesEngine(2);
  const result = engine.scan("Kêu gọi lật đổ chính quyền.");
  assert.ok(result.risks.some((r) => r.category === "cybersecurity_law"));
});

test("scan detects Vietnamese mobile number", () => {
  const engine = new RulesEngine(2);
  const result = engine.scan("Gọi cho tôi 0987654321 để biết thêm.");
  assert.ok(result.hasDoxxing);
  assert.ok(result.risks.some((r) => r.category === "doxxing"));
});

test("scan detects unverified rumor", () => {
  const engine = new RulesEngine(3);
  const result = engine.scan("Nghe nói công ty này sắp phá sản.");
  assert.ok(result.risks.some((r) => r.category === "unverified_rumor"));
});

test("low sensitivity filters low-severity risks", () => {
  const engine = new RulesEngine(1);
  const result = engine.scan("Nghe nói công ty này sắp phá sản.");
  assert.strictEqual(result.overallRisk, "none");
});

test("high sensitivity includes low-severity risks", () => {
  const engine = new RulesEngine(3);
  const result = engine.scan("Nghe nói công ty này sắp phá sản.");
  assert.ok(result.risks.length > 0);
});

test("scan detects AI-generated text markers", () => {
  const engine = new RulesEngine(2, true);
  const result = engine.scan("Bài viết này được tạo bởi ChatGPT.");
  assert.ok(result.risks.some((r) => r.category === "ai_generated_text"));
});

test("disabling AI detection skips ai_generated_text risks", () => {
  const engine = new RulesEngine(2, false);
  const result = engine.scan("Bài viết này được tạo bởi ChatGPT.");
  assert.strictEqual(result.risks.some((r) => r.category === "ai_generated_text"), false);
});
