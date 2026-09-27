/**
 * core/i18n.js
 * Lightweight runtime i18n for VN SafePost Copilot.
 * Default language is Vietnamese ("vi"); English ("en") is optional.
 */

(function (global) {
  "use strict";

  const DEFAULT_LANG = "vi";

  const DICTIONARIES = {
    vi: {
      // Popup
      popupSubtitle: "Trợ lý an toàn & tuân thủ cho mạng xã hội",
      apiKeyLabel: "Gemini API Key",
      optional: "(tùy chọn)",
      apiKeyHint:
        "Lưu cục bộ trong trình duyệt. Không rồi khỏi thiết bị. Chỉ cần cho phân tích AI Tier 2.",
      apiKeyPlaceholder: "Dán Gemini API key để bật phân tích AI Tier 2",
      showKey: "Hiện key",
      getKey: "Lấy key",
      apiKeyNote:
        "Không cần key, SafePost vẫn chạy regex cục bộ (Tier 1) và so khớp corpus cục bộ (Tier 1.5) ngoại tuyến.",
      sensitivityLabel: "Độ nhạy",
      sensitivityLow: "Thấp",
      sensitivityMedium: "Trung bình",
      sensitivityHigh: "Cao",
      enabledLabel: "Bật quét SafePost",
      detectAiContentLabel: "Cảnh báo nội dung AI",
      detectAiContentNote:
        "Phát hiện dấu hiệu văn bản được tạo bởi AI hoặc không ghi nhãn AI/Deepfake.",
      saveButton: "Lưu cài đặt",
      settingsSaved: "Đã lưu cài đặt.",
      settingsError: "Lỗi: {message}",
      languageLabel: "Ngôn ngữ",

      // Content / modal
      loaderMessage: "SafePost đang quét nội dung...",
      advisoryTitle: "Cảnh báo trước khi đăng",
      riskLevelLabel: "Mức độ rủi ro: {level}",
      defaultSummary: "SafePost phát hiện một số điểm cần lưu ý trước khi đăng.",
      corpusSummary:
        "SafePost phát hiện {count} trường hợp tương tự đã được công bố.",
      suggestionLabel: "Gợi ý:",
      compliantEditLabel: "Bản chỉnh sửa gợi ý:",
      applyEditButton: "Sử dụng bản chỉnh sửa",
      notice:
        "Quyết định cuối cùng thuộc về bạn. SafePost chỉ đưa ra gợi ý, không chặn hay kiểm duyệt nội dung.",
      editButton: "Chỉnh sửa bài viết",
      postAnywayButton: "Vẫn đăng",
      corpusReasonPrefix: "[Tương tự vụ {id}] {summary}",

      // Severities
      severityNone: "An toàn",
      severityLow: "Thấp",
      severityMedium: "Trung bình",
      severityHigh: "Cao",
      severityCritical: "Nghiêm trọng",

      // Categories
      categoryCybersecurityLaw: "Luật An ninh mạng",
      categoryDecree72: "Nghị định 72",
      categoryDecree152020: "Nghị định 15/2020",
      categoryDefamation: "Phỉ báng / xúc phạm",
      categoryDoxxing: "Lộ thông tin cá nhân",
      categoryUnverifiedRumor: "Tin đồn chưa kiểm chứng",
      categorySyntheticMedia: "AI / Deepfake",
      categoryAiGeneratedText: "Văn bản AI",
      categoryHateSpeech: "Ngôn từ thù địch",
      categoryOther: "Khác",
    },

    en: {
      // Popup
      popupSubtitle: "Grammarly for Social Safety & Compliance",
      apiKeyLabel: "Gemini API Key",
      optional: "(optional)",
      apiKeyHint:
        "Stored locally in your browser. Never leaves your device. Required only for AI-powered Tier 2 analysis.",
      apiKeyPlaceholder:
        "Paste your Gemini API key here to enable Tier 2 AI review",
      showKey: "Show key",
      getKey: "Get a key",
      apiKeyNote:
        "Without a key, SafePost still runs local regex (Tier 1) and local corpus matching (Tier 1.5) offline.",
      sensitivityLabel: "Sensitivity",
      sensitivityLow: "Low",
      sensitivityMedium: "Medium",
      sensitivityHigh: "High",
      enabledLabel: "Enable SafePost scanning",
      detectAiContentLabel: "Warn about AI-generated content",
      detectAiContentNote:
        "Detect signs of AI-generated text or unlabeled AI/Deepfake media.",
      saveButton: "Save Settings",
      settingsSaved: "Settings saved.",
      settingsError: "Error: {message}",
      languageLabel: "Language",

      // Content / modal
      loaderMessage: "SafePost is scanning your content...",
      advisoryTitle: "Warning before posting",
      riskLevelLabel: "Risk level: {level}",
      defaultSummary: "SafePost found a few things to review before posting.",
      corpusSummary: "SafePost found {count} similar published cases.",
      suggestionLabel: "Suggestion:",
      compliantEditLabel: "Suggested edit:",
      applyEditButton: "Use suggested edit",
      notice:
        "The final decision is yours. SafePost only offers suggestions; it does not block or censor content.",
      editButton: "Edit post",
      postAnywayButton: "Post anyway",
      corpusReasonPrefix: "[Similar to case {id}] {summary}",

      // Severities
      severityNone: "Safe",
      severityLow: "Low",
      severityMedium: "Medium",
      severityHigh: "High",
      severityCritical: "Critical",

      // Categories
      categoryCybersecurityLaw: "Cybersecurity Law",
      categoryDecree72: "Decree 72",
      categoryDecree152020: "Decree 15/2020",
      categoryDefamation: "Defamation / Insult",
      categoryDoxxing: "Personal information exposure",
      categoryUnverifiedRumor: "Unverified rumor",
      categorySyntheticMedia: "AI / Deepfake",
      categoryAiGeneratedText: "AI-generated text",
      categoryHateSpeech: "Hate speech",
      categoryOther: "Other",
    },
  };

  class I18n {
    constructor(lang) {
      this.setLanguage(lang || DEFAULT_LANG);
    }

    setLanguage(lang) {
      this.lang = lang in DICTIONARIES ? lang : DEFAULT_LANG;
      this.dict = DICTIONARIES[this.lang];
    }

    t(key, vars) {
      vars = vars || {};
      let text = this.dict[key];
      if (text === undefined) {
        text = DICTIONARIES.en[key] !== undefined ? DICTIONARIES.en[key] : key;
      }
      return text.replace(/\{(\w+)\}/g, function (_, name) {
        return vars[name] !== undefined ? String(vars[name]) : "{" + name + "}";
      });
    }

    severity(severity) {
      return this.t(
        "severity" + severity.charAt(0).toUpperCase() + severity.slice(1)
      );
    }

    category(cat) {
    const map = {
      cybersecurity_law: "categoryCybersecurityLaw",
      decree_72: "categoryDecree72",
      decree_15_2020: "categoryDecree152020",
      defamation: "categoryDefamation",
      doxxing: "categoryDoxxing",
      unverified_rumor: "categoryUnverifiedRumor",
      synthetic_media: "categorySyntheticMedia",
      ai_generated_text: "categoryAiGeneratedText",
      hate_speech: "categoryHateSpeech",
      other: "categoryOther",
    };
      return this.t(map[cat] || "categoryOther");
    }
  }

  const safePostI18n = new I18n(DEFAULT_LANG);

  global.SafePostI18n = I18n;
  global.safePostI18n = safePostI18n;
  global.SafePostI18nDefaults = { DEFAULT_LANG, DICTIONARIES };
})(typeof globalThis !== "undefined" ? globalThis : this);
