/**
 * gemini.js
 * Google Gemini REST client with JSON Schema structured outputs (Tier 2 analysis).
 * The API key is supplied at runtime from chrome.storage.local and is never logged.
 */

const DEFAULT_MODEL = "gemini-1.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    overallRisk: {
      type: "string",
      enum: ["none", "low", "medium", "high", "critical"],
      description: "Aggregated risk level of the post.",
    },
    summary: {
      type: "string",
      description: "A concise Vietnamese explanation of the overall assessment.",
    },
    risks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "cybersecurity_law",
              "decree_72",
              "decree_15_2020",
              "defamation",
              "doxxing",
              "unverified_rumor",
              "synthetic_media",
              "ai_generated_text",
              "hate_speech",
              "other",
            ],
          },
          severity: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
          },
          reason: {
            type: "string",
            description: "Why this rule was triggered, in Vietnamese.",
          },
          suggestion: {
            type: "string",
            description: "Specific, actionable rewrite or compliance suggestion in Vietnamese.",
          },
        },
        required: ["category", "severity", "reason", "suggestion"],
      },
    },
    hasSyntheticMedia: {
      type: "boolean",
      description: "True if the post mentions or contains AI-generated/deepfake media without clear labeling.",
    },
    hasDoxxing: {
      type: "boolean",
      description: "True if the post exposes private contact/personal information.",
    },
    compliantEditSuggestion: {
      type: "string",
      description: "A rewritten Vietnamese draft that reduces risk while preserving intent, if applicable.",
    },
  },
  required: ["overallRisk", "summary", "risks", "hasSyntheticMedia", "hasDoxxing"],
};

class GeminiEvaluator {
  constructor(apiKey, model = DEFAULT_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
  }

  formatMatchedCases(matchedCases) {
    if (!matchedCases || matchedCases.length === 0) return "";
    const lines = matchedCases.map((m, idx) => {
      const c = m.case || m;
      return `[${idx + 1}] ${c.category} (${c.severity}): ${c.summary}\nCách viết lại an toàn: ${c.safe_rewrite}`;
    });
    return `Các trường hợp tương tự đã được công bố:\n${lines.join("\n\n")}\n`;
  }

  buildPrompt(text, { localRisks = [], matchedCases = [] } = {}) {
    const localNotes = localRisks.length
      ? `Local heuristic hits: ${localRisks.map((r) => r.category).join(", ")}.`
      : "No local heuristic hits.";

    const caseNotes = this.formatMatchedCases(matchedCases);

    return {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Bạn là một trợ lý pháp lý & đạo đức cho ngưới dùng Facebook tại Việt Nam. Đánh giá bài đăng sau theo Luật An ninh mạng 2018, Nghị định 72/2013/NĐ-CP và Nghị định 15/2020/NĐ-CP. Quy tắc:
- Chỉ đưa ra CẢNH BÁO và GỢI Ý, không chặn hoặc kiểm duyệt.
- Phân loại rủi ro: none, low, medium, high, critical.
- Phát hiện: tin giả/tin đồn chưa kiểm chứng, xúc phạm/vu khống, lộ thông tin cá nhân (doxxing), nội dung tổng hợp/AI/deepfake chưa ghi nhãn, văn bản có dấu hiệu được tạo bởi AI nhưng không minh bạch, nội dung vi phạm an ninh mạng.
- Gợi ý cách chỉnh sửa cho phù hợp pháp luật và văn hóa mạng.

${localNotes}

${caseNotes}
BÀI ĐĂNG:
"""
${text}
"""

Trả về JSON theo schema đã cho.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    };
  }

  async evaluate(text, context = {}) {
    if (!this.apiKey) {
      throw new Error("Gemini API key is missing.");
    }
    if (!text || text.trim().length < 5) {
      return {
        overallRisk: "none",
        summary: "Nội dung quá ngắn, không đủ cơ sở để đánh giá.",
        risks: [],
        hasSyntheticMedia: false,
        hasDoxxing: false,
        compliantEditSuggestion: "",
      };
    }

    const url = `${API_BASE}/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const body = this.buildPrompt(text, {
      localRisks: context.localRisks,
      matchedCases: context.matchedCases,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const parsed = JSON.parse(raw);
      return this.normalize(parsed);
    } catch (err) {
      if (err.name === "SyntaxError") {
        throw new Error("Gemini returned invalid JSON.");
      }
      throw err;
    }
  }

  normalize(result) {
    return {
      overallRisk: RESPONSE_SCHEMA.properties.overallRisk.enum.includes(result.overallRisk)
        ? result.overallRisk
        : "low",
      summary: result.summary || "",
      risks: Array.isArray(result.risks) ? result.risks : [],
      hasSyntheticMedia: Boolean(result.hasSyntheticMedia),
      hasDoxxing: Boolean(result.hasDoxxing),
      compliantEditSuggestion: result.compliantEditSuggestion || "",
    };
  }
}

const geminiGlobalScope = typeof globalThis !== "undefined" ? globalThis : self;
geminiGlobalScope.GeminiEvaluator = GeminiEvaluator;
