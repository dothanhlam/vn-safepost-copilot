/**
 * tests/corpus-matcher.test.js
 * Unit tests for the Tier 1.5 corpus matcher and its local embedding engine.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await import("../core/case-corpus.js");
await import("../core/corpus-matcher.js");

const { CorpusMatcher, SafePostCorpusUtils, SafePostCaseCorpus } = globalThis;
const { cosineSimilarity, normalizeText, tokenize, ngrams, LocalEmbeddingEngine } =
  SafePostCorpusUtils;

const corpusPath = path.resolve(__dirname, "../core/case-corpus.json");
const corpusData = JSON.parse(fs.readFileSync(corpusPath, "utf8"));

describe("SafePostCorpusUtils", () => {
  it("normalizes text consistently", () => {
    assert.strictEqual(normalizeText("  Hello-World!!  "), "hello world");
    assert.strictEqual(normalizeText("Tin ĐỒN  rằng"), "tin đồn rằng");
  });

  it("tokenizes Vietnamese text", () => {
    const tokens = tokenize("Tin giả về dịch bệnh!");
    assert.deepStrictEqual(tokens, ["tin", "giả", "về", "dịch", "bệnh"]);
  });

  it("generates word n-grams", () => {
    const tokens = ["a", "b", "c"];
    const grams = ngrams(tokens, [1, 2]);
    assert.deepStrictEqual(grams, ["a", "b", "c", "a_b", "b_c"]);
  });

  it("computes cosine similarity correctly", () => {
    assert.strictEqual(cosineSimilarity([1, 0], [0, 1]), 0);
    assert.ok(Math.abs(cosineSimilarity([0.7071, 0.7071], [0.7071, 0.7071]) - 1) < 1e-4);
    assert.strictEqual(cosineSimilarity([], [1]), 0);
    assert.strictEqual(cosineSimilarity([1, 2], [1, 2, 3]), 0);
  });
});

describe("LocalEmbeddingEngine", () => {
  it("builds vocabulary and computes embeddings", () => {
    const corpus = [
      { id: "c1", embedding_text: "tin giả về dịch bệnh", summary: "" },
      { id: "c2", embedding_text: "lộ số điện thoại cá nhân", summary: "" },
      { id: "c3", embedding_text: "tin đồn chưa kiểm chứng", summary: "" },
    ];
    const engine = new LocalEmbeddingEngine(corpus);
    engine.build();
    assert.ok(engine.ready);
    assert.ok(engine.vocabulary.size > 0);

    const vec = engine.embed("tin giả dịch bệnh");
    assert.strictEqual(vec.length, engine.vocabulary.size);

    const sims = engine.similarity("tin giả về dịch bệnh");
    assert.strictEqual(sims.length, 3);
    assert.ok(sims[0] > sims[1] || sims[0] > sims[2], "Most similar to first case");
  });
});

describe("CorpusMatcher phrase matching", () => {
  it("finds phrase matches above threshold", () => {
    const matcher = new CorpusMatcher({ phraseMatchThreshold: 0.65 });
    matcher.corpus = [
      {
        id: "test-001",
        category: "doxxing",
        severity: "high",
        summary: "Expose phone number",
        violation_phrases: ["số điện thoại của ngưới này là"],
        safe_rewrite: "Remove phone number.",
      },
    ];

    const text = "Mọi ngưới hãy gọi cho số điện thoại của ngưới này là 0912345678";
    const matches = matcher.matchPhrases(text);
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].case.id, "test-001");
    assert.strictEqual(matches[0].score, 1);
  });

  it("returns no matches when phrase threshold is not met", () => {
    const matcher = new CorpusMatcher({ phraseMatchThreshold: 0.99 });
    matcher.corpus = [
      {
        id: "test-002",
        category: "defamation",
        severity: "medium",
        summary: "Accusation",
        violation_phrases: ["lừa đảo", "ăn cắp"],
        safe_rewrite: "Be objective.",
      },
    ];

    const matches = matcher.matchPhrases("Công ty này có vấn đề");
    assert.strictEqual(matches.length, 0);
  });
});

describe("Embedded corpus", () => {
  it("exposes SafePostCaseCorpus with the same cases as JSON", () => {
    assert.ok(SafePostCaseCorpus, "SafePostCaseCorpus should be defined");
    assert.ok(Array.isArray(SafePostCaseCorpus.cases));
    assert.strictEqual(SafePostCaseCorpus.cases.length, corpusData.cases.length);
    assert.strictEqual(SafePostCaseCorpus.cases[0].id, corpusData.cases[0].id);
  });
});

describe("CorpusMatcher with real corpus (local fallback)", () => {
  it("loads corpus and runs local matching without API key", async () => {
    const matcher = new CorpusMatcher({
      phraseMatchThreshold: 0.65,
      embeddingThreshold: 0.05,
      topK: 3,
    });

    matcher.corpus = corpusData.cases;

    const text = "tin dịch bệnh chưa kiểm chứng, dịch đã lan ra toàn thành phố, bệnh viện quá tải, ngưới chết la liệt";
    const result = await matcher.findMatches(text, "");

    assert.strictEqual(typeof result.hasMatch, "boolean");
    assert.ok(result.phraseHitCount > 0, "Expected at least one phrase hit");
    assert.ok(result.embeddingHitCount >= 0);
    assert.ok(["low", "medium", "high", "critical", "none"].includes(result.overallSeverity));
  });

  it("loads real corpus JSON structure", async () => {
    assert.ok(Array.isArray(corpusData.cases));
    assert.ok(corpusData.cases.length > 0);

    for (const c of corpusData.cases) {
      assert.ok(c.id, "Each case must have an id");
      assert.ok(c.category, "Each case must have a category");
      assert.ok(c.severity, "Each case must have a severity");
      assert.ok(c.summary, "Each case must have a summary");
      assert.ok(Array.isArray(c.violation_phrases), "Each case must have violation_phrases array");
      assert.ok(c.safe_rewrite, "Each case must have safe_rewrite");
      assert.ok(c.embedding_text, "Each case must have embedding_text");
    }
  });
});

describe("CorpusMatcher offscreen delegation", () => {
  it("uses injected message provider when available", async () => {
    const expectedResult = {
      matches: [{ type: "mock", case: { id: "mock-1", severity: "high" }, score: 0.9 }],
      overallSeverity: "high",
      hasMatch: true,
      phraseHitCount: 0,
      embeddingHitCount: 1,
    };

    const matcher = new CorpusMatcher({
      messageProvider: {
        send: async (msg) => {
          assert.strictEqual(msg.action, "matchCorpus");
          assert.strictEqual(msg.text, "test text");
          return expectedResult;
        },
      },
    });

    const result = await matcher.findMatches("test text", "fake-key");
    assert.deepStrictEqual(result, expectedResult);
  });
});
