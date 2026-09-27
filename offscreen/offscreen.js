/**
 * offscreen.js
 * Local embedding engine running inside a Chrome offscreen document.
 *
 * Architecture note:
 * This implementation uses a lightweight TF-IDF + n-gram text representation so
 * the extension works offline without any Gemini API key. The same message-based
 * interface can host an ONNX/Transformers.js model later: replace the vectorizer
 * below with a pipeline("feature-extraction", model) call and keep the cosine
 * similarity / top-k logic unchanged.
 */

const CORPUS_URL = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL)
  ? chrome.runtime.getURL("core/case-corpus.json")
  : "core/case-corpus.json";
const MAX_VOCAB_SIZE = 2000;
const NGRAM_SIZES = [1, 2, 3];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\d]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const normalized = normalize(text);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((t) => t.length > 0);
}

function ngrams(tokens, sizes = NGRAM_SIZES) {
  const result = [];
  for (const size of sizes) {
    if (size === 1) {
      result.push(...tokens);
      continue;
    }
    for (let i = 0; i <= tokens.length - size; i++) {
      result.push(tokens.slice(i, i + size).join("_"));
    }
  }
  return result;
}

function termFrequency(tokens) {
  const freq = new Map();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  return freq;
}

function buildVocabulary(documents, maxSize = MAX_VOCAB_SIZE) {
  const docFreq = new Map();
  for (const doc of documents) {
    const seen = new Set(doc);
    for (const t of seen) {
      docFreq.set(t, (docFreq.get(t) || 0) + 1);
    }
  }

  // Prefer terms that appear in multiple documents but are not stopwords.
  const scored = Array.from(docFreq.entries()).map(([term, df]) => ({
    term,
    df,
    score: df, // simple selection; could use TF-IDF or chi-squared
  }));

  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, maxSize).map((x) => x.term);

  const index = new Map();
  selected.forEach((term, i) => index.set(term, i));
  return index;
}

function computeIdf(documents, vocabulary) {
  const N = documents.length || 1;
  const idf = new Float32Array(vocabulary.size);
  const docFreq = new Map();

  for (const doc of documents) {
    const seen = new Set(doc);
    for (const t of seen) {
      if (vocabulary.has(t)) {
        docFreq.set(t, (docFreq.get(t) || 0) + 1);
      }
    }
  }

  for (const [term, idx] of vocabulary) {
    const df = docFreq.get(term) || 0;
    idf[idx] = Math.log(1 + N / (1 + df));
  }
  return idf;
}

function vectorize(tokens, vocabulary, idf) {
  const vec = new Float32Array(vocabulary.size);
  const tf = termFrequency(tokens);
  for (const [term, count] of tf) {
    const idx = vocabulary.get(term);
    if (idx !== undefined) {
      vec[idx] = count * idf[idx];
    }
  }
  return vec;
}

function normalizeVector(vec) {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are normalized, so dot = cosine
}

function normalizePhrase(text) {
  return normalize(text).replace(/\s+/g, " ");
}

class LocalEmbeddingEngine {
  constructor() {
    this.corpus = [];
    this.vocabulary = new Map();
    this.idf = null;
    this.corpusVectors = [];
    this.ready = false;
  }

  async loadCorpus() {
    let data;

    // Prefer the embedded JS corpus if available.
    if (typeof self !== "undefined" && self.SafePostCaseCorpus) {
      data = self.SafePostCaseCorpus;
    } else {
      const response = await fetch(CORPUS_URL);
      if (!response.ok) throw new Error(`Corpus load failed: ${response.status}`);
      data = await response.json();
    }

    this.corpus = Array.isArray(data.cases) ? data.cases : [];

    const documents = this.corpus.map((c) =>
      ngrams(tokenize(c.embedding_text || c.summary || ""))
    );
    this.vocabulary = buildVocabulary(documents);
    this.idf = computeIdf(documents, this.vocabulary);

    this.corpusVectors = documents.map((tokens) => {
      const vec = vectorize(tokens, this.vocabulary, this.idf);
      return normalizeVector(vec);
    });

    this.ready = true;
    console.log("[SafePost Offscreen] Local embedding engine ready.", {
      cases: this.corpus.length,
      vocab: this.vocabulary.size,
    });
  }

  embed(text) {
    if (!this.ready) throw new Error("Engine not ready.");
    const tokens = ngrams(tokenize(text));
    const vec = vectorize(tokens, this.vocabulary, this.idf);
    return normalizeVector(vec);
  }

  matchPhrases(text) {
    const normalizedText = normalizePhrase(text);
    const matches = [];
    for (const item of this.corpus) {
      const phrases = Array.isArray(item.violation_phrases) ? item.violation_phrases : [];
      let matchedCount = 0;
      const matchedPhrases = [];
      for (const phrase of phrases) {
        const np = normalizePhrase(phrase);
        if (np && normalizedText.includes(np)) {
          matchedCount++;
          matchedPhrases.push(phrase);
        }
      }
      if (matchedCount > 0) {
        const score = Math.min(1, matchedCount / Math.max(1, phrases.length));
        matches.push({
          type: "phrase",
          case: item,
          score,
          matchedPhrases,
        });
      }
    }
    return matches.sort((a, b) => b.score - a.score);
  }

  matchEmbeddings(text, threshold = 0.25) {
    if (!this.ready) return [];
    const inputVector = this.embed(text);
    const matches = [];
    for (let i = 0; i < this.corpusVectors.length; i++) {
      const similarity = cosineSimilarity(inputVector, this.corpusVectors[i]);
      if (similarity >= threshold) {
        matches.push({
          type: "embedding",
          case: this.corpus[i],
          score: similarity,
          matchedPhrases: [],
        });
      }
    }
    return matches.sort((a, b) => b.score - a.score);
  }

  findMatches(text, options = {}) {
    const {
      topK = 3,
      embeddingThreshold = 0.25,
      phraseMatchThreshold = 0.65,
    } = options;

    const phraseMatches = this.matchPhrases(text).filter((m) => m.score >= phraseMatchThreshold);
    const embeddingMatches = this.matchEmbeddings(text, embeddingThreshold);

    const seen = new Set();
    const combined = [];

    function add(match) {
      const id = match.case.id;
      if (seen.has(id)) return;
      seen.add(id);
      combined.push(match);
    }

    for (const m of phraseMatches) add(m);
    for (const m of embeddingMatches) add(m);

    combined.sort((a, b) => b.score - a.score);
    const result = combined.slice(0, topK);

    const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
    let maxSeverity = 0;
    for (const m of result) {
      maxSeverity = Math.max(maxSeverity, severityOrder[m.case.severity] || 0);
    }

    const overallSeverity =
      maxSeverity >= 4 ? "critical" :
      maxSeverity >= 3 ? "high" :
      maxSeverity >= 2 ? "medium" :
      maxSeverity >= 1 ? "low" : "none";

    return {
      matches: result,
      overallSeverity,
      hasMatch: result.length > 0,
      phraseHitCount: phraseMatches.length,
      embeddingHitCount: embeddingMatches.length,
    };
  }
}

const engine = new LocalEmbeddingEngine();

// Pre-load corpus as soon as the offscreen document starts.
engine.loadCorpus().catch((err) => {
  console.error("[SafePost Offscreen] Failed to load corpus:", err);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "offscreen") return false;

  (async () => {
    if (!engine.ready) {
      await engine.loadCorpus();
    }

    if (message.action === "matchCorpus") {
      const result = engine.findMatches(message.text, {
        topK: message.topK,
        embeddingThreshold: message.embeddingThreshold,
        phraseMatchThreshold: message.phraseMatchThreshold,
      });
      sendResponse(result);
      return;
    }

    if (message.action === "embedText") {
      const vector = Array.from(engine.embed(message.text));
      sendResponse({ vector });
      return;
    }

    sendResponse({ error: "Unknown action." });
  })();

  return true; // async response
});

console.log("[SafePost Offscreen] Local embedding engine loaded.");
