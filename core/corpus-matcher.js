/**
 * corpus-matcher.js
 * Tier 1.5 semantic matcher against the public-case corpus.
 *
 * This module prefers to delegate embedding work to an offscreen document
 * managed by the background service worker. If the offscreen path is unavailable
 * (older browser, test environment), it falls back to a lightweight local
 * TF-IDF + n-gram embedding engine that runs in the content script.
 *
 * No Gemini API key is required for corpus matching anymore.
 */

const CORPUS_PATH = "core/case-corpus.json";
const MAX_VOCAB_SIZE = 2000;
const NGRAM_SIZES = [1, 2, 3];

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\d]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhrase(text) {
  return normalizeText(text).replace(/\s+/g, " ");
}

function tokenize(text) {
  const normalized = normalizeText(text);
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
  const scored = Array.from(docFreq.entries()).map(([term, df]) => ({ term, df, score: df }));
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
  return dot;
}

class LocalEmbeddingEngine {
  constructor(corpus) {
    this.corpus = corpus || [];
    this.vocabulary = new Map();
    this.idf = null;
    this.corpusVectors = [];
    this.ready = false;
  }

  build() {
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
  }

  embed(text) {
    if (!this.ready) this.build();
    const tokens = ngrams(tokenize(text));
    const vec = vectorize(tokens, this.vocabulary, this.idf);
    return normalizeVector(vec);
  }

  similarity(text) {
    const inputVector = this.embed(text);
    const similarities = [];
    for (let i = 0; i < this.corpusVectors.length; i++) {
      similarities.push(cosineSimilarity(inputVector, this.corpusVectors[i]));
    }
    return similarities;
  }
}

class CorpusMatcher {
  constructor(options = {}) {
    this.corpus = [];
    this.phraseMatchThreshold = options.phraseMatchThreshold ?? 0.65;
    this.embeddingThreshold = options.embeddingThreshold ?? 0.25;
    this.topK = options.topK ?? 3;
    this.localEngine = null;
    this._runtimeUrlResolver = options.runtimeUrlResolver || null;
    this._messageProvider = options.messageProvider || null;
  }

  _resolveUrl(path) {
    if (this._runtimeUrlResolver) return this._runtimeUrlResolver(path);

    try {
      if (typeof chrome !== "undefined" && chrome.runtime) {
        if (typeof chrome.runtime.getURL === "function") {
          return chrome.runtime.getURL(path);
        }
        if (chrome.runtime.id) {
          return `chrome-extension://${chrome.runtime.id}/${path}`;
        }
      }
    } catch (err) {
      console.error("[SafePost] Failed to resolve extension URL:", err);
    }

    return path;
  }

  _canUseOffscreen() {
    if (this._messageProvider) return true;
    return (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.sendMessage &&
      typeof chrome.offscreen !== "undefined"
    );
  }

  async _sendMessage(message) {
    if (this._messageProvider) {
      return this._messageProvider.send(message);
    }
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { target: "background", ...message },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  async loadCorpus() {
    if (this.corpus.length > 0) return this.corpus;

    // Prefer the embedded JS corpus (no fetch, works reliably in content scripts).
    if (typeof self !== "undefined" && self.SafePostCaseCorpus) {
      const data = self.SafePostCaseCorpus;
      this.corpus = Array.isArray(data.cases) ? data.cases : [];
      return this.corpus;
    }

    // Fallback: fetch the JSON from the extension origin.
    const url = this._resolveUrl(CORPUS_PATH);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load corpus: ${response.status}`);
    }
    const data = await response.json();
    this.corpus = Array.isArray(data.cases) ? data.cases : [];
    return this.corpus;
  }

  async initLocalEngine() {
    if (this.localEngine && this.localEngine.ready) return this.localEngine;
    await this.loadCorpus();
    this.localEngine = new LocalEmbeddingEngine(this.corpus);
    this.localEngine.build();
    return this.localEngine;
  }

  matchPhrases(text) {
    const normalizedText = normalizePhrase(text);
    if (!normalizedText) return [];
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
        if (score >= this.phraseMatchThreshold) {
          matches.push({
            type: "phrase",
            case: item,
            score,
            matchedPhrases,
          });
        }
      }
    }
    return matches.sort((a, b) => b.score - a.score);
  }

  async findMatches(text, _apiKey, options = {}) {
    const topK = options.topK ?? this.topK;
    const embeddingThreshold = options.embeddingThreshold ?? this.embeddingThreshold;
    const phraseMatchThreshold = options.phraseMatchThreshold ?? this.phraseMatchThreshold;

    // Prefer offscreen document when available (MV3, Chrome 109+).
    if (this._canUseOffscreen()) {
      try {
        const result = await this._sendMessage({
          action: "matchCorpus",
          text,
          topK,
          embeddingThreshold,
          phraseMatchThreshold,
        });
        if (!result || result.error) throw new Error(result?.error || "Offscreen matching failed.");
        return result;
      } catch (err) {
        console.warn("[SafePost] Offscreen matching unavailable, falling back to local engine:", err.message);
      }
    }

    // Fallback: run the local TF-IDF engine directly in the content script.
    await this.loadCorpus();
    const phraseMatches = this.matchPhrases(text).filter((m) => m.score >= phraseMatchThreshold);

    if (!this.localEngine) {
      this.localEngine = new LocalEmbeddingEngine(this.corpus);
      this.localEngine.build();
    }
    const similarities = this.localEngine.similarity(text);
    const embeddingMatches = [];
    for (let i = 0; i < similarities.length; i++) {
      if (similarities[i] >= embeddingThreshold) {
        embeddingMatches.push({
          type: "embedding",
          case: this.corpus[i],
          score: similarities[i],
          matchedPhrases: [],
        });
      }
    }
    embeddingMatches.sort((a, b) => b.score - a.score);

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

const corpusGlobalScope = typeof globalThis !== "undefined" ? globalThis : self;
corpusGlobalScope.CorpusMatcher = CorpusMatcher;
corpusGlobalScope.SafePostCorpusUtils = {
  cosineSimilarity,
  normalizeText,
  tokenize,
  ngrams,
  LocalEmbeddingEngine,
};
