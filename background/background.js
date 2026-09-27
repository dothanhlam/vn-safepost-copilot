/**
 * background.js
 * Service worker that manages the offscreen document hosting the local embedding engine.
 * All heavy model/embedding work is delegated to the offscreen document so the content
 * script stays lightweight and the main thread is not blocked.
 */

const OFFSCREEN_PATH = "offscreen/offscreen.html";
const OFFSCREEN_REASONS = [chrome.offscreen?.Reason?.WORKERS ?? "WORKERS"];
let creatingOffscreen = null;

async function hasOffscreenDocument() {
  if (typeof chrome.offscreen === "undefined") return false;
  if (chrome.offscreen.hasDocument) {
    return chrome.offscreen.hasDocument();
  }
  // Fallback for older Chrome (109-115).
  if (typeof clients !== "undefined" && clients.matchAll) {
    const matchedClients = await clients.matchAll({ includeUncontrolled: true });
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
    return matchedClients.some((client) => client.url === offscreenUrl);
  }
  return false;
}

async function ensureOffscreenDocument() {
  if (typeof chrome.offscreen === "undefined") {
    throw new Error("chrome.offscreen API is not available.");
  }

  if (await hasOffscreenDocument()) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  try {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: OFFSCREEN_REASONS,
      justification:
        "Run a local text embedding engine for privacy-first social-post risk detection.",
    });
    await creatingOffscreen;
  } catch (err) {
    // Another context may have created it concurrently.
    if (err?.message && err.message.includes("only a single")) {
      if (await hasOffscreenDocument()) return;
    }
    throw err;
  } finally {
    creatingOffscreen = null;
  }
}

function sendToOffscreen(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ target: "offscreen", ...message }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function handleMatchCorpus(message, sender, sendResponse) {
  try {
    await ensureOffscreenDocument();
    const result = await sendToOffscreen({
      action: "matchCorpus",
      text: message.text,
      topK: message.topK ?? 3,
      embeddingThreshold: message.embeddingThreshold ?? 0.25,
      phraseMatchThreshold: message.phraseMatchThreshold ?? 0.65,
    });
    sendResponse(result);
  } catch (err) {
    console.error("[SafePost Background] matchCorpus failed:", err);
    sendResponse({
      error: err.message,
      matches: [],
      overallSeverity: "none",
      hasMatch: false,
    });
  }
}

async function handleEmbedText(message, sender, sendResponse) {
  try {
    await ensureOffscreenDocument();
    const result = await sendToOffscreen({
      action: "embedText",
      text: message.text,
    });
    sendResponse(result);
  } catch (err) {
    console.error("[SafePost Background] embedText failed:", err);
    sendResponse({ error: err.message, vector: null });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== "background") return;

  if (message.action === "matchCorpus") {
    handleMatchCorpus(message, sender, sendResponse);
    return true; // async response
  }

  if (message.action === "embedText") {
    handleEmbedText(message, sender, sendResponse);
    return true; // async response
  }

  return false;
});

console.log("[SafePost Background] Service worker initialized.");
