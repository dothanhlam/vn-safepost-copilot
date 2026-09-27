/**
 * content.js
 * Facebook composer interception, scanning orchestration, and advisory UI.
 * Runs in an isolated content-script world with access to the Facebook DOM.
 */

const NAMESPACE = "spc";
const ALLOWED_FLAG = `data-${NAMESPACE}-allowed`;
const DEBUG = true;

let settings = { apiKey: "", sensitivity: 2, enabled: true, detectAiContent: true, language: "vi" };
let isScanning = false;
let corpusMatcher = null;
let i18n = null;
let settingsLoaded = false;

function log(...args) {
  if (DEBUG) console.log("[SafePost]", ...args);
}

function getI18n() {
  if (i18n) return i18n;
  if (self.SafePostI18n) {
    i18n = new self.SafePostI18n(settings.language || "vi");
    return i18n;
  }
  // Fallback object so the UI never crashes if i18n hasn't loaded.
  return {
    t: (key, vars) => {
      const dict = {
        loaderMessage: "SafePost đang quét nội dung...",
        advisoryTitle: "Cảnh báo trước khi đăng",
        riskLevelLabel: "Mức độ rủi ro: {level}",
        defaultSummary: "SafePost phát hiện một số điểm cần lưu ý trước khi đăng.",
        corpusSummary: "SafePost phát hiện {count} trường hợp tương tự đã được công bố.",
        suggestionLabel: "Gợi ý:",
        compliantEditLabel: "Bản chỉnh sửa gợi ý:",
        applyEditButton: "Sử dụng bản chỉnh sửa",
        notice: "Quyết định cuối cùng thuộc về bạn. SafePost chỉ đưa ra gợi ý, không chặn hay kiểm duyệt nội dung.",
        editButton: "Chỉnh sửa bài viết",
        postAnywayButton: "Vẫn đăng",
        corpusReasonPrefix: "[Tương tự vụ {id}] {summary}",
      };
      let text = dict[key] || key;
      if (vars) {
        text = text.replace(/\{(\w+)\}/g, (_, name) =>
          vars[name] !== undefined ? String(vars[name]) : `{${name}}`
        );
      }
      return text;
    },
    severity: (s) => s,
    category: (c) => c,
  };
}

function getSeverityMeta(severity) {
  const classMap = {
    none: "spc-severity--none",
    low: "spc-severity--low",
    medium: "spc-severity--medium",
    high: "spc-severity--high",
    critical: "spc-severity--critical",
  };
  return {
    label: getI18n().severity(severity),
    className: classMap[severity] || classMap.low,
  };
}

async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get([
      "apiKey",
      "sensitivity",
      "enabled",
      "detectAiContent",
      "language",
    ]);
    settings = {
      apiKey: stored.apiKey || "",
      sensitivity: Number(stored.sensitivity ?? 2),
      enabled: stored.enabled !== false,
      detectAiContent: stored.detectAiContent !== false,
      language: stored.language || "vi",
    };
    if (self.SafePostI18n) {
      i18n = new self.SafePostI18n(settings.language);
    }
    settingsLoaded = true;
    log("Settings loaded:", settings);
  } catch (err) {
    console.error("[SafePost] Failed to load settings:", err);
    settingsLoaded = true;
    if (self.SafePostI18n) {
      i18n = new self.SafePostI18n("vi");
    }
  }
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPostButton(el) {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  const role = (el.getAttribute?.("role") || "").toLowerCase();
  if (tag !== "button" && role !== "button") return false;

  const rawText = (el.innerText || el.textContent || "").trim();
  const ariaLabel = (el.getAttribute?.("aria-label") || "").trim();
  const title = (el.getAttribute?.("title") || "").trim();
  const dataTestid = (el.getAttribute?.("data-testid") || "").toLowerCase();

  const text = normalizeText(rawText || ariaLabel || title);
  if (!text) return false;

  const keywords = ["dang", "post", "publish", "chia se", "share", "dang bai", "dang status"];
  const matchesKeyword = keywords.some((kw) => text.includes(kw));
  const matchesTestid = dataTestid.includes("post") || dataTestid.includes("composer");

  log("isPostButton check:", { text, dataTestid, matchesKeyword, matchesTestid });
  return matchesKeyword || matchesTestid;
}

function findComposerContainer(startNode) {
  let node = startNode;
  while (node && node !== document.body && node !== document.documentElement) {
    const role = node.getAttribute?.("role")?.toLowerCase();
    const ariaModal = node.getAttribute?.("aria-modal") === "true";
    if (role === "dialog" || ariaModal) return node;
    node = node.parentElement;
  }
  return null;
}

function findVisibleTextbox(container) {
  const candidates = container
    ? container.querySelectorAll('div[role="textbox"]')
    : document.querySelectorAll('div[role="textbox"]');

  for (const textbox of candidates) {
    if (textbox.isContentEditable) {
      const rect = textbox.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return textbox;
      }
    }
  }
  return null;
}

function findComposerTextbox(startNode) {
  // 1. Try the currently focused contenteditable.
  const active = document.activeElement;
  if (active && active.getAttribute?.("role") === "textbox" && active.isContentEditable) {
    return active;
  }

  // 2. Look inside the composer dialog containing the button.
  const dialog = findComposerContainer(startNode);
  if (dialog) {
    const textbox = findVisibleTextbox(dialog);
    if (textbox) return textbox;
  }

  // 3. Fallback: search the whole document for a visible composer textbox.
  return findVisibleTextbox(null);
}

function extractPostText(textbox) {
  if (!textbox) return "";
  return (textbox.innerText || textbox.textContent || "").trim();
}

function createOverlay(id) {
  let overlay = document.getElementById(id);
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = id;
  overlay.className = "spc-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-live", "polite");
  return overlay;
}

function showLoader(message) {
  const overlay = createOverlay(`${NAMESPACE}-loader`);
  overlay.innerHTML = `
    <div class="spc-modal spc-modal--loader">
      <div class="spc-spinner" aria-hidden="true"></div>
      <p class="spc-modal__text">${escapeHtml(message || getI18n().t("loaderMessage"))}</p>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function hideLoader() {
  const overlay = document.getElementById(`${NAMESPACE}-loader`);
  if (overlay) overlay.remove();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderRiskItem(risk) {
  const cat = risk.category || "other";
  const severity = risk.severity || "low";
  const meta = getSeverityMeta(severity);
  return `
    <li class="spc-risk">
      <div class="spc-risk__header">
        <span class="spc-badge ${meta.className}">${escapeHtml(meta.label)}</span>
        <span class="spc-risk__category">${escapeHtml(getI18n().category(cat))}</span>
      </div>
      <p class="spc-risk__reason">${escapeHtml(risk.reason || risk.message || "")}</p>
      ${risk.suggestion ? `<p class="spc-risk__suggestion"><strong>${escapeHtml(getI18n().t("suggestionLabel"))}</strong> ${escapeHtml(risk.suggestion)}</p>` : ""}
    </li>
  `;
}

function showAdvisory(result, originalButton, textbox) {
  const overlay = createOverlay(`${NAMESPACE}-advisory`);
  const overall = result.overallRisk || "low";
  const meta = getSeverityMeta(overall);
  const risks = Array.isArray(result.risks) ? result.risks : [];
  const summary = result.summary || getI18n().t("defaultSummary");

  const compliantSuggestion = result.compliantEditSuggestion
    ? `<div class="spc-suggestion-box">
        <strong>${escapeHtml(getI18n().t("compliantEditLabel"))}</strong>
        <p>${escapeHtml(result.compliantEditSuggestion)}</p>
        <button class="spc-button spc-button--secondary" data-action="apply">${escapeHtml(getI18n().t("applyEditButton"))}</button>
       </div>`
    : "";

  overlay.innerHTML = `
    <div class="spc-modal spc-modal--advisory">
      <header class="spc-modal__header">
        <img src="${chrome.runtime.getURL("assets/icons/icon48.png")}" alt="" class="spc-modal__icon" />
        <div>
          <h2 class="spc-modal__title">${escapeHtml(getI18n().t("advisoryTitle"))}</h2>
          <p class="spc-modal__subtitle">${escapeHtml(getI18n().t("riskLevelLabel", { level: `<span class="spc-badge ${meta.className}">${escapeHtml(meta.label)}</span>` }))}</p>
        </div>
      </header>
      <div class="spc-modal__body">
        <p class="spc-modal__summary">${escapeHtml(summary)}</p>
        ${risks.length ? `<ul class="spc-risk-list">${risks.map(renderRiskItem).join("")}</ul>` : ""}
        ${compliantSuggestion}
        <p class="spc-modal__notice">${escapeHtml(getI18n().t("notice"))}</p>
      </div>
      <footer class="spc-modal__footer">
        <button class="spc-button spc-button--secondary" data-action="edit">${escapeHtml(getI18n().t("editButton"))}</button>
        <button class="spc-button spc-button--primary" data-action="post">${escapeHtml(getI18n().t("postAnywayButton"))}</button>
      </footer>
    </div>
  `;

  overlay.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;

    if (action === "edit") {
      overlay.remove();
      if (textbox) textbox.focus();
      return;
    }

    if (action === "apply" && result.compliantEditSuggestion && textbox) {
      textbox.innerText = result.compliantEditSuggestion;
      overlay.remove();
      if (textbox) textbox.focus();
      return;
    }

    if (action === "post") {
      overlay.remove();
      if (originalButton) {
        originalButton.setAttribute(ALLOWED_FLAG, "true");
        originalButton.click();
        setTimeout(() => originalButton.removeAttribute(ALLOWED_FLAG), 500);
      }
    }
  });

  document.body.appendChild(overlay);
  log("Advisory shown:", overall, risks.length);
}

function allowPost(button) {
  if (!button) return;
  button.setAttribute(ALLOWED_FLAG, "true");
  button.click();
  setTimeout(() => button.removeAttribute(ALLOWED_FLAG), 500);
}

function severityRank(severity) {
  const order = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
  return order[severity] ?? 0;
}

function maxSeverity(a, b) {
  return severityRank(a) >= severityRank(b) ? a : b;
}

function corpusMatchToRisk(match) {
  const c = match.case;
  return {
    category: c.category,
    severity: c.severity,
    reason: getI18n().t("corpusReasonPrefix", { id: c.id, summary: c.summary }),
    suggestion: c.safe_rewrite,
    corpusMatch: true,
    score: match.score,
  };
}

function mergeCorpusIntoLocal(localResult, corpusResult) {
  const corpusRisks = (corpusResult.matches || []).map(corpusMatchToRisk);
  const combinedRisks = [...localResult.risks, ...corpusRisks];
  const overallRisk = maxSeverity(localResult.overallRisk, corpusResult.overallSeverity);
  const summary = corpusRisks.length
    ? getI18n().t("corpusSummary", { count: corpusRisks.length })
    : localResult.summary || getI18n().t("defaultSummary");

  return {
    overallRisk,
    risks: combinedRisks,
    hasDoxxing: localResult.hasDoxxing || corpusRisks.some((r) => r.category === "doxxing"),
    hasSyntheticMedia:
      localResult.hasSyntheticMedia || corpusRisks.some((r) => r.category === "synthetic_media"),
    summary,
  };
}

async function scanAndDecide(button, textbox, text) {
  const loader = showLoader();

  try {
    const engine = new self.RulesEngine(settings.sensitivity, settings.detectAiContent);
    const localResult = engine.scan(text);
    log("Local result:", localResult);

    let corpusResult = { matches: [], overallSeverity: "none", hasMatch: false };
    if (corpusMatcher) {
      corpusResult = await corpusMatcher.findMatches(text, settings.apiKey, { topK: 3 });
      log("Corpus result:", corpusResult);
    }

    const combinedResult = mergeCorpusIntoLocal(localResult, corpusResult);
    log("Combined result:", combinedResult);

    let geminiResult = null;
    const needsGemini =
      settings.apiKey &&
      (combinedResult.overallRisk !== "none" || settings.sensitivity >= 3);

    if (needsGemini) {
      const evaluator = new self.GeminiEvaluator(settings.apiKey);
      geminiResult = await evaluator.evaluate(text, {
        localRisks: localResult.risks,
        matchedCases: corpusResult.matches.map((m) => m.case),
      });
      log("Gemini result:", geminiResult);
    }

    const finalResult = geminiResult || combinedResult;

    hideLoader();

    if (finalResult.overallRisk === "none" || finalResult.overallRisk === "low") {
      log("Risk low/none, allowing post.");
      allowPost(button);
    } else {
      showAdvisory(finalResult, button, textbox);
    }
  } catch (err) {
    hideLoader();
    console.error("[SafePost] Scan failed:", err);
    // Fail-open: allow the post if the scan errors out.
    allowPost(button);
  } finally {
    isScanning = false;
  }
}

function handlePostClick(event) {
  log("handlePostClick fired:", event.type, event.target?.tagName, event.target?.getAttribute?.("role"));

  if (isScanning) {
    log("Scanning in progress, ignoring click.");
    return;
  }
  if (!settingsLoaded) {
    log("Settings not loaded yet, ignoring click.");
    return;
  }
  if (!settings.enabled) {
    log("Extension disabled, ignoring click.");
    return;
  }

  const button = event.target.closest('button, [role="button"]');
  log("Closest button/role=button:", button);
  if (!isPostButton(button)) return;

  if (button.getAttribute(ALLOWED_FLAG) === "true") {
    button.removeAttribute(ALLOWED_FLAG);
    return;
  }

  const textbox = findComposerTextbox(button);
  const text = extractPostText(textbox);
  log("Post button clicked. Textbox found:", !!textbox, "Text length:", text.length);

  if (!text || text.length < 3) return;

  // Must block Facebook's submit synchronously, before any async work.
  event.preventDefault();
  event.stopImmediatePropagation();

  isScanning = true;
  scanAndDecide(button, textbox, text);
}

async function init() {
  console.log("[SafePost] Initializing...");
  await loadSettings();
  console.log("[SafePost] Settings loaded:", settings, "settingsLoaded:", settingsLoaded);

  corpusMatcher = new self.CorpusMatcher({
    phraseMatchThreshold: 0.65,
    embeddingThreshold: 0.72,
    topK: 3,
    maxEmbeddingCases: 20,
  });

  // Capture-phase interception ensures we see the click before Facebook's handlers.
  document.addEventListener("click", handlePostClick, true);
  document.addEventListener("pointerdown", handlePostClick, true);
  document.addEventListener("mousedown", handlePostClick, true);
  console.log("[SafePost] Click listeners attached.");

  // Temporary: log every click to verify the listener is active.
  document.addEventListener("click", (e) => {
    log("Global click captured:", e.target?.tagName, e.target?.getAttribute?.("role"), e.target?.innerText?.slice(0, 40));
  }, true);

  // React to settings changes while the page is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.apiKey) settings.apiKey = changes.apiKey.newValue;
    if (changes.sensitivity) settings.sensitivity = Number(changes.sensitivity.newValue);
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    if (changes.detectAiContent) settings.detectAiContent = changes.detectAiContent.newValue !== false;
    if (changes.language) {
      settings.language = changes.language.newValue || "vi";
      if (i18n && self.SafePostI18n) {
        i18n.setLanguage(settings.language);
      }
    }
  });

  console.log("[SafePost] VN SafePost Copilot initialized.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
