# VN SafePost Copilot

A privacy-first, client-side Chrome Extension (Manifest V3) that acts as an ethical and legal guardrail assistant — like "Grammarly for Social Safety & Compliance" — for Facebook users in Vietnam.

It scans draft Facebook posts before they go live, highlighting potential risks under Vietnamese cybersecurity regulations, unverified rumors, unlabeled AI/deepfake media, unlabeled AI-generated text, and accidental doxxing/defamation. **It never blocks or silently censors**; it only offers advisory suggestions and leaves the final posting decision to you.

**No API key required.** Tier 1 (regex) and Tier 1.5 (local corpus matching) run entirely offline in your browser. A Gemini API key is only needed if you want the optional Tier 2 AI review.

---

## Table of Contents

- [Features](#features)
- [Privacy Guarantee](#privacy-guarantee)
- [Installation](#installation)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Development](#development)
- [Compliance Scope](#compliance-scope)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **Capture-phase interception** of Facebook post/composer submit buttons (`Đăng`, `Post`, `Share`, etc.).
- **Three-tier scanning:**
  1. **Tier 1 — Local heuristics:** Fast regex pre-filters for Vietnamese legal keywords, doxxing patterns, rumors, synthetic-media cues, and AI-generated text markers.
  2. **Tier 1.5 — Public-case corpus matcher:** Compares the post against an anonymized corpus of real enforcement cases using phrase matching and optional Gemini embedding similarity.
  3. **Tier 2 — Gemini AI:** Google Gemini `gemini-1.5-flash` with JSON Schema structured outputs for nuanced legal/social risk analysis, including AI-generated text detection.
- **Advisory-first UI:** A non-blocking modal explains risks, shows a severity badge, and suggests compliant edits.
- **Configurable sensitivity:** Low / Medium / High threshold controls how aggressively the extension escalates to the AI review.
- **On/off toggle** and persistent settings via `chrome.storage.local`.
- **Scoped, conflict-free CSS:** All UI classes use the `spc-` prefix and live in an overlay above Facebook's DOM.

---

## Privacy Guarantee

- **No server-side logging.** There is no backend service.
- **Gemini API key is optional.** Tier 1 and Tier 1.5 run offline without any API key.
- Your Gemini API key (if provided) is stored only in `chrome.storage.local` on your own machine.
- Local embedding computation runs in a hidden **offscreen document** inside the extension; no post content is sent to any third party unless you explicitly enable Tier 2 Gemini review.
- The extension does not read your Facebook feed, messages, or profile data — it only inspects the text inside the composer you are actively trying to submit.

---

## Installation

### From source (developer mode)

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `vn-safepost-copilot` folder.
5. The extension icon should appear in your toolbar.

### Required permissions

- `storage` — to save your API key, sensitivity, and on/off state locally.
- Host permission for `https://*.facebook.com/*` — to run the content script on Facebook.

---

## Configuration

1. Click the **VN SafePost Copilot** icon in the Chrome toolbar.
2. Choose **Ngôn ngữ / Language** — Vietnamese is the default; English is available.
3. (Optional) Paste your **Gemini API key** to enable Tier 2 AI review.
   - Get a free key at [Google AI Studio](https://aistudio.google.com/app/apikey).
   - Without a key, Tier 1 (regex) and Tier 1.5 (local corpus matching) still work offline.
4. Toggle **Warn about AI-generated content** to enable detection of AI-generated text and unlabeled AI/Deepfake media.
5. Choose your **Sensitivity** level:
   - **Low** — only escalates high-severity local hits.
   - **Medium** — escalates medium+ hits (default, recommended).
   - **High** — escalates any low+ hit and always runs the AI review if a key is saved.
6. Toggle the extension on/off as needed.
6. Click **Save Settings**.

> **Note:** If no API key is saved, the extension runs Tier 1 + Tier 1.5 locally and skips Tier 2 Gemini.

---

## How It Works

1. You write a post on Facebook.
2. When you click the post/submit button, SafePost intercepts the click at the capture phase.
3. It extracts the composer text from the Facebook `div[role="textbox"]`.
4. **Tier 1** runs local regex rules (Vietnamese cybersecurity law, Decree 72, Decree 15/2020, defamation, doxxing, rumors, synthetic media, and AI-generated text markers).
5. **Tier 1.5** matches the post against the public-case corpus:
   - Phrase matching on paraphrased violation patterns.
   - Local TF-IDF + n-gram embedding similarity in a hidden offscreen document (no API key, no network).
6. If the combined severity reaches your sensitivity threshold **and you have saved a Gemini API key**, **Tier 2** sends the text to Gemini with a Vietnamese legal-compliance prompt, top-k matching cases as context, and a strict JSON Schema.
7. SafePost shows an advisory modal with:
   - Overall risk level
   - A short summary
   - Per-risk badges and explanations
   - A suggested compliant rewrite (when available)
   - **Edit**, **Apply suggestion**, and **Post anyway** actions.
8. You decide whether to edit or publish.

---

## Project Structure

```text
vn-safepost-copilot/
├── manifest.json              # Extension metadata, permissions & content script mappings
├── background/
│   └── background.js          # Service worker managing the offscreen document
├── offscreen/
│   ├── offscreen.html         # Hidden document hosting the local embedding engine
│   └── offscreen.js           # TF-IDF + n-gram vectorizer (swappable for ONNX/Transformers.js)
├── popup/
│   ├── popup.html             # Settings UI: optional API key, sensitivity, on/off toggle
│   ├── popup.js               # Settings persistence via chrome.storage.local
│   └── popup.css              # Minimal, clean modern popup interface
├── content/
│   ├── content.js             # Capture-phase DOM interception, loader states & modal controller
│   └── styles.css             # Scoped styles for alert modals, badges, and warning callouts
├── core/
│   ├── i18n.js                # Vietnamese / English runtime localization (default: Vietnamese)
│   ├── case-corpus.js         # Embedded corpus object (auto-generated from case-corpus.json)
│   ├── case-corpus.json       # Source corpus of anonymized real enforcement cases
│   ├── rules.js               # Fast local heuristic regex pre-filters (Tier 1)
│   ├── gemini.js              # Gemini REST client & JSON Schema compliance evaluator (Tier 2)
│   └── corpus-matcher.js      # Routes corpus matching to offscreen document or local fallback
├── assets/
│   └── icons/                 # Extension shield icons (16, 48, 128px)
├── package.json
└── README.md
```

---

## Development

### Lint / syntax check

Because the project uses vanilla JavaScript with no bundler, the fastest validation is a syntax check with Node:

```bash
npm run lint
```

This runs `node --check` on all JavaScript files.

### Loading local changes

After editing files, return to `chrome://extensions/` and click the **refresh** icon on the VN SafePost Copilot card. Content scripts already injected into open Facebook tabs may require a page reload.

The first time a post is scanned, the extension creates an offscreen document to load the local embedding engine. This is a one-time setup per browser session.

### Adding new heuristics

Open `core/rules.js` and add entries to `PATTERN_GROUPS` or `DOXXING_PATTERNS`. Each pattern group needs:

- `category` — one of the predefined category keys.
- `severity` — `low`, `medium`, `high`, or `critical`.
- `patterns` — array of `RegExp` objects.

If you add a new category, also add its label to `CATEGORY_LABELS` in `content/content.js` and a human-readable label + suggestion in `core/rules.js`.

### Adding new public cases

Open `core/case-corpus.json` and append an entry with:

- `id` — unique identifier.
- `source_type` — `official_announcement` or `press_report`.
- `category` / `severity` — same taxonomy as Tier 1.
- `summary` — anonymized summary of the enforcement action.
- `violation_phrases` — paraphrased phrases for local phrase matching.
- `safe_rewrite` — a compliant alternative wording.
- `embedding_text` — a compact sentence used for embedding similarity.

**Do not include original post text, real names, phone numbers, addresses, or other PII.**

---

## Compliance Scope

SafePost is designed to help users understand common risk areas in Vietnamese online speech. It currently covers:

- **Luật An ninh mạng 2018** — content that may be interpreted as undermining national security, inciting violence, terrorism, or distorting history.
- **Nghị định 72/2013/NĐ-CP** — false information, fraud, defamation, and slander.
- **Nghị định 15/2020/NĐ-CP** — false information about epidemics, natural disasters, national defense, or public order.
- **Civil defamation / doxxing** — exposing phone numbers, emails, ID numbers, bank accounts, or detailed addresses of private individuals.
- **Unverified rumors** — phrases that signal hearsay or lack of sourcing.
- **Synthetic media** — unlabeled AI-generated images, deepfakes, or manipulated video.

> **Disclaimer:** This extension is an educational advisory tool, not legal advice. It cannot guarantee compliance with Vietnamese law or prevent legal consequences. Always consult a qualified legal professional for specific concerns.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Extension does not scan | Extension disabled or no composer text | Enable it in the popup and make sure the composer has at least 3 characters. |
| "Gemini API error" | Invalid or exhausted API key (Tier 2 only) | Verify your key, or disable Tier 2 by leaving the key blank to use offline Tiers 1 + 1.5. |
| Modal does not appear | Facebook DOM changed | Reload the page or open a GitHub issue with the page region you were posting from. |
| Post button unresponsive | `isScanning` stuck after an error | Reload the Facebook tab. |
| Offscreen document failed | Chrome < 109 or `offscreen` permission missing | Update Chrome and ensure the manifest requests the `offscreen` permission. |

### Enable verbose logging

Open the browser console on a Facebook tab and look for messages prefixed with `[SafePost]`.

---

## License

MIT — see [LICENSE](./LICENSE) for details.

---

## Contributing

Contributions are welcome. Please keep the extension:

- **Zero build tooling** — vanilla JS/CSS/HTML only.
- **Privacy-first** — no external backend, no telemetry.
- **Advisory-only** — never block, censor, or auto-modify user content without explicit user action.

Open an issue or pull request to suggest new heuristics, improve the Gemini prompt, or add support for other Vietnamese social platforms.
