/**
 * rules.js
 * Fast local heuristic pre-filters (Tier 1) for Vietnamese social-post risk detection.
 * Runs entirely in the browser; no network call is made unless a rule triggers
 * at or above the user's configured sensitivity threshold.
 */

const SEVERITY_ORDER = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const CATEGORIES = {
  cybersecurity_law: "Luật An ninh mạng 2018",
  decree_72: "Nghị định 72/2013/NĐ-CP (quản lý TTĐT)",
  decree_15_2020: "Nghị định 15/2020/NĐ-CP (xử phạt ANM)",
  defamation: "Phỉ báng / vu khống / xúc phạm",
  doxxing: "Lộ thông tin cá nhân (doxxing)",
  unverified_rumor: "Tin đồn / nội dung chưa kiểm chứng",
  synthetic_media: "Nội dung tổng hợp / deepfake chưa ghi nhãn",
  ai_generated_text: "Văn bản có dấu hiệu được tạo bởi AI",
};

const SUGGESTIONS = {
  cybersecurity_law:
    "Kiểm tra lại ngôn từ. Tránh nội dung có thể bị hiểu là tuyên truyền chống Nhà nước, kích động bạo lực hoặc xuyên tạc lịch sử.",
  decree_72:
    "Hãy xác minh nguồn tin trước khi đăng. Không đăng tin giả mạo, lừa đảo hoặc gây hoang mang dư luận.",
  decree_15_2020:
    "Các nội dung liên quan dịch bệnh, thiên tai hoặc an ninh quốc phòng cần dẫn nguồn chính thức.",
  defamation:
    "Tránh cáo buộc cá nhân/tổ chức khi chưa có bằng chứng rõ ràng. Cân nhắc dùng ngôn ngữ khách quan.",
  doxxing:
    "Xóa hoặc che số điện thoại, email, địa chỉ, CMND/CCCD, số tài khoản ngân hàng để bảo vệ quyền riêng tư.",
  unverified_rumor:
    "Thêm nguồn đáng tin cậy hoặc ghi rõ 'chưa kiểm chứng' nếu nội dung chỉ là tin đồn.",
  synthetic_media:
    "Ghi nhãn rõ ràng nếu hình ảnh/video được tạo bởi AI, chỉnh sửa sâu hoặc là deepfake.",
  ai_generated_text:
    "Nếu nội dung được tạo hoặc hỗ trợ bởi AI, hãy ghi nhãn minh bạch để tránh hiểu lầm.",
};

const PATTERN_GROUPS = [
  {
    category: "cybersecurity_law",
    severity: "high",
    patterns: [
      /lật[\s\-]?đổ|chống[\s\-]?phá[\s\-]?nhà[\s\-]?nước|phá[\s\-]?hoại[\s\-]?khối[\s\-]?đại[\s\-]?đoàn[\s\-]?kết/iu,
      /kích[\s\-]?động[\s\-]?bạo[\s\-]?lực|kích[\s\-]?động[\s\-]?chiến[\s\-]?tranh/iu,
      /tuyên[\s\-]?truyền[\s\-]?chống|chống[\s\-]?lại[\s\-]?chính[\s\-]?quyền/iu,
      /xuyên[\s\-]?tạc[\s\-]?lịch[\s\-]?sử|phỉ[\s\-]?báng[\s\-]?lãnh[\s\-]?tụ/iu,
      /khủng[\s\-]?bố|tổ[\s\-]?chức[\s\-]?khủng[\s\-]?bố/iu,
    ],
  },
  {
    category: "decree_72",
    severity: "medium",
    patterns: [
      /tin[\s\-]?giả|fake[\s\-]?news|tung[\s\-]?tin[\s\-]?giả|tin[\s\-]?đồn[\s\-]?thiếu[\s\-]?căn[\s\-]?cứ/iu,
      /lừa[\s\-]?đảo|gây[\s\-]?hoang[\s\-]?mang|gây[\s\-]?rối[\s\-]?loạn/iu,
      /xúc[\s\-]?phạm|lăng[\s\-]?mạ|vu[\s\-]?khống|bôi[\s\-]?nhọ/iu,
      /đăng[\s\-]?tải[\s\-]?thông[\s\-]?tin[\s\-]?sai[\s\-]?sự[\s\-]?thật/iu,
    ],
  },
  {
    category: "decree_15_2020",
    severity: "medium",
    patterns: [
      /dịch[\s\-]?bệnh|thiên[\s\-]?tai|tình[\s\-]?trạng[\s\-]?khẩn[\s\-]?cấp/iu,
      /an[\s\-]?ninh[\s\-]?quốc[\s\-]?phòng|gây[\s\-]?rối[\s\-]?trật[\s\-]?tự[\s\-]?công[\s\-]?cộng/iu,
      /tuyên[\s\-]?truyền[\s\-]?sai[\s\-]?sự[\s\-]?thật[\s\-]?về[\s\-]?dịch/iu,
    ],
  },
  {
    category: "defamation",
    severity: "medium",
    patterns: [
      /(lừa[\s\-]?đảo|ăn[\s\-]?cắp|tham[\s\-]?nhũng|bán[\s\-]?nước|phản[\s\-]?bội)\s+\w{2,}/iu,
      /\w{2,}\s+(lừa[\s\-]?đảo|ăn[\s\-]?cắp|tham[\s\-]?nhũng|bán[\s\-]?nước|phản[\s\-]?bội)/iu,
      /công[\s\-]?kích[\s\-]?cá[\s\-]?nhân|bôi[\s\-]?nhọ[\s\-]?danh[\s\-]?dự/iu,
    ],
  },
  {
    category: "unverified_rumor",
    severity: "low",
    patterns: [
      /nghe[\s\-]?nói|đồn[\s\-]?rằng|mọi[\s\-]?người[\s\-]?đang[\s\-]?nói|chưa[\s\-]?kiểm[\s\-]?chứng/iu,
      /không[\s\-]?rõ[\s\-]?nguồn|tin[\s\-]?đồn[\s\-]?rộ|đang[\s\-]?lan[\s\-]?truyền/iu,
      /có[\s\-]?vẻ[\s\-]?như|hình[\s\-]?như|nghe[\s\-]?đâu|kể[\s\-]?nghe/iu,
    ],
  },
  {
    category: "synthetic_media",
    severity: "low",
    patterns: [
      /deep[\s\-]?fake|deepfake|ảnh[\s\-]?giả|video[\s\-]?giả|clip[\s\-]?giả/iu,
      /bị[\s\-]?chỉnh[\s\-]?sửa|bị[\s\-]?ghép|sửa[\s\-]?bằng[\s\-]?ai|tạo[\s\-]?bởi[\s\-]?ai/iu,
      /trí[\s\-]?tuệ[\s\-]?nhân[\s\-]?tạo[\s\-]?tạo|ai[\s\-]?generated|synthetic[\s\-]?media/iu,
    ],
  },
  {
    category: "ai_generated_text",
    severity: "medium",
    patterns: [
      /\b(ChatGPT|GPT[-\s]?4|Gemini|Claude|Copilot|Midjourney|DALL[-\s]?E|Stable Diffusion)\b/iu,
      /(generated\s+by\s+AI|created\s+by\s+AI|viết\s+bởi\s+AI|tạo\s+bởi\s+AI|tạo\s+bởi\s+trí\s+tuệ\s+nhân\s+tạo)/iu,
      /(tôi\s+là\s+mô\s+hình\s+ngôn\s+ngữ|tôi\s+là\s+trợ\s+lý\s+AI|xin\s+lỗi\s+vì\s+sự\s+bất\s+tiện\s+này)/iu,
    ],
  },
];

const DOXXING_PATTERNS = [
  {
    name: "Vietnamese mobile number",
    severity: "high",
    regex: /\b0[35789]\d{8}\b/g,
  },
  {
    name: "Email address",
    severity: "medium",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    name: "ID card number (CMND/CCCD)",
    severity: "high",
    regex: /\b(CMND|CCCD|chứng[\s\-]?minh[\s\-]?nhân[\s\-]?dân|căn[\s\-]?cước[\s\-]?công[\s\-]?dân)\s*:?\s*\d{9,12}\b/iu,
  },
  {
    name: "Bank account hint",
    severity: "medium",
    regex: /\b(STK|số[\s\-]?tài[\s\-]?khoản|tài[\s\-]?khoản[\s\-]?ngân[\s\-]?hàng)\s*:?\s*\d{6,}/iu,
  },
  {
    name: "Detailed address hint",
    severity: "low",
    regex: /\b(số[\s\-]?nhà|đường|phường|quận|huyện|tỉnh|thành[\s\-]?phố)\s+\w+/iu,
  },
];

function normalize(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchAny(text, patterns) {
  return patterns.some((re) => re.test(text));
}

class RulesEngine {
  constructor(sensitivity = 2, detectAiContent = true) {
    this.sensitivity = sensitivity;
    this.thresholdSeverity = this.sensitivityToSeverity(sensitivity);
    this.detectAiContent = detectAiContent;
  }

  sensitivityToSeverity(sensitivity) {
    switch (Number(sensitivity)) {
      case 1:
        return "high";
      case 3:
        return "low";
      case 2:
      default:
        return "medium";
    }
  }

  scan(rawText) {
    const text = normalize(rawText);
    if (!text) return { overallRisk: "none", risks: [], hasDoxxing: false, hasSyntheticMedia: false };

    const risks = [];

    for (const group of PATTERN_GROUPS) {
      if (group.category === "ai_generated_text" && !this.detectAiContent) continue;
      if (matchAny(text, group.patterns)) {
        risks.push({
          category: group.category,
          categoryLabel: CATEGORIES[group.category],
          severity: group.severity,
          message: `Phát hiện dấu hiệu liên quan đến ${CATEGORIES[group.category]}.`,
          suggestion: SUGGESTIONS[group.category],
        });
      }
    }

    let hasDoxxing = false;
    for (const { name, severity, regex } of DOXXING_PATTERNS) {
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        hasDoxxing = true;
        risks.push({
          category: "doxxing",
          categoryLabel: CATEGORIES.doxxing,
          severity,
          message: `Phát hiện ${name} trong nội dung.`,
          suggestion: SUGGESTIONS.doxxing,
        });
      }
    }

    const hasSyntheticMedia = risks.some((r) => r.category === "synthetic_media");

    const filtered = risks.filter((r) => SEVERITY_ORDER[r.severity] >= SEVERITY_ORDER[this.thresholdSeverity]);

    const overallRisk = this.computeOverallRisk(filtered);

    return {
      overallRisk,
      risks: filtered,
      hasDoxxing,
      hasSyntheticMedia,
      rawHitCount: risks.length,
    };
  }

  computeOverallRisk(risks) {
    if (risks.length === 0) return "none";
    let max = 0;
    for (const r of risks) {
      max = Math.max(max, SEVERITY_ORDER[r.severity]);
    }
    if (max >= SEVERITY_ORDER.critical) return "critical";
    if (max >= SEVERITY_ORDER.high) return "high";
    if (max >= SEVERITY_ORDER.medium) return "medium";
    return "low";
  }
}

const rulesGlobalScope = typeof globalThis !== "undefined" ? globalThis : self;
rulesGlobalScope.RulesEngine = RulesEngine;
rulesGlobalScope.SafePostCategories = CATEGORIES;
rulesGlobalScope.SafePostSuggestions = SUGGESTIONS;
