(function (global) {
  "use strict";

  var SAFE_POST_CASE_CORPUS = {
  "version": "1.0.0",
  "description": "Anonymized public-case corpus for Vietnamese social-post risk detection. Each entry is a paraphrased summary of real enforcement actions reported by official sources or mainstream press. No original post text, names, phone numbers, or addresses are preserved.",
  "cases": [
    {
      "id": "case-2024-001",
      "source_type": "official_announcement",
      "category": "decree_15_2020",
      "severity": "high",
      "summary": "Tung tin giả về dịch bệnh trên mạng xã hội, gây hoang mang dư luận.",
      "violation_phrases": [
        "dịch đã lan ra toàn thành phố",
        "bệnh viện quá tải",
        "ngưới chết la liệt",
        "tin dịch bệnh chưa kiểm chứng"
      ],
      "safe_rewrite": "Thông tin về dịch bệnh cần được kiểm chứng qua kênh chính thức của Bộ Y tế.",
      "embedding_text": "Tung tin giả về dịch bệnh trên mạng xã hội gây hoang mang dư luận"
    },
    {
      "id": "case-2024-002",
      "source_type": "press_report",
      "category": "doxxing",
      "severity": "high",
      "summary": "Đăng số điện thoại và địa chỉ cá nhân của ngưới khác kèm lợi kêu gọi tẩy chay.",
      "violation_phrases": [
        "số điện thoại của ngưới này là",
        "địa chỉ nhà ở",
        "mọi ngưới hãy gọi điện phản đối",
        "tẩy chay cá nhân này"
      ],
      "safe_rewrite": "Nếu có tranh chấp, hãy báo cáo cơ quan chức năng thay vì công khai thông tin cá nhân.",
      "embedding_text": "Công khai số điện thoại và địa chỉ cá nhân kèm lợi kêu gọi tẩy chay"
    },
    {
      "id": "case-2024-003",
      "source_type": "official_announcement",
      "category": "cybersecurity_law",
      "severity": "critical",
      "summary": "Đăng nội dung kêu gọi biểu tình trái phép và kích động chống chính quyền.",
      "violation_phrases": [
        "xuống đường biểu tình",
        "lật đổ chính quyền",
        "chống phá nhà nước",
        "kích động bạo lực"
      ],
      "safe_rewrite": "Các vấn đề xã hội nên được phản ánh qua kênh chính thống và hợp pháp.",
      "embedding_text": "Kêu gọi biểu tình trái phép và kích động chống chính quyền"
    },
    {
      "id": "case-2024-004",
      "source_type": "press_report",
      "category": "defamation",
      "severity": "medium",
      "summary": "Vu khống một doanh nghiệp lừa đảo khách hàng khi chưa có bằng chứng.",
      "violation_phrases": [
        "công ty này lừa đảo",
        "ăn cắp tiền của khách hàng",
        "bốc hơi hàng tỷ đồng",
        "cảnh báo mọi ngưới tránh xa"
      ],
      "safe_rewrite": "Tôi đang tìm hiểu thông tin về một số phản ánh liên quan đến doanh nghiệp này.",
      "embedding_text": "Vu khống doanh nghiệp lừa đảo khi chưa có bằng chứng"
    },
    {
      "id": "case-2024-005",
      "source_type": "official_announcement",
      "category": "synthetic_media",
      "severity": "medium",
      "summary": "Phát tán video AI-generated giả mạo lợi nói của lãnh đạo mà không ghi nhãn.",
      "violation_phrases": [
        "video do AI tạo ra",
        "deepfake",
        "giọng nói bị ghép",
        "video giả mạo lãnh đạo"
      ],
      "safe_rewrite": "Video này có dấu hiệu được tạo/sửa đổi bằng công nghệ AI. Cần xác minh nguồn gốc trước khi chia sẻ.",
      "embedding_text": "Phát tán video AI-generated giả mạo lãnh đạo không ghi nhãn"
    },
    {
      "id": "case-2024-006",
      "source_type": "press_report",
      "category": "unverified_rumor",
      "severity": "low",
      "summary": "Chia sẻ thông tin nghe đồn về sáp nhập đơn vị hành chính chưa được xác nhận.",
      "violation_phrases": [
        "nghe nói sắp sáp nhập",
        "đồn rằng tỉnh này sẽ chia tách",
        "chưa kiểm chứng nhưng mọi ngưới đang nói",
        "tin đồn rộ khắp nơi"
      ],
      "safe_rewrite": "Thông tin về sáp nhập hành chính cần chờ văn bản chính thức của cơ quan có thẩm quyền.",
      "embedding_text": "Chia sẻ tin đồn chưa kiểm chứng về sáp nhập hành chính"
    },
    {
      "id": "case-2024-007",
      "source_type": "official_announcement",
      "category": "decree_72",
      "severity": "medium",
      "summary": "Đăng tin giả mạo về chính sách tiền tệ gây hoang mang trên mạng xã hội.",
      "violation_phrases": [
        "tiền sắp mất giá",
        "ngân hàng sắp phá sản",
        "tin giả về kinh tế",
        "gây hoang mang dư luận"
      ],
      "safe_rewrite": "Thông tin về chính sách tiền tệ cần dẫn nguồn từ Ngân hàng Nhà nước hoặc cơ quan chức năng.",
      "embedding_text": "Đăng tin giả mạo về chính sách tiền tệ gây hoang mang"
    },
    {
      "id": "case-2024-008",
      "source_type": "press_report",
      "category": "doxxing",
      "severity": "medium",
      "summary": "Công khai ảnh chứng minh nhân dân và số tài khoản ngân hàng của ngưới khác.",
      "violation_phrases": [
        "CMND của ngưới này",
        "số tài khoản ngân hàng",
        "công khai chứng minh nhân dân",
        "lộ thông tin cá nhân"
      ],
      "safe_rewrite": "Không nên đăng giấy tờ tùy thân hoặc thông tin tài khoản của ngưới khác.",
      "embedding_text": "Công khai CMND và số tài khoản ngân hàng của ngưới khác"
    },
    {
      "id": "case-2024-009",
      "source_type": "official_announcement",
      "category": "cybersecurity_law",
      "severity": "high",
      "summary": "Xuyên tạc lịch sử và phỉ báng lãnh tụ trên nền tảng mạng xã hội.",
      "violation_phrases": [
        "xuyên tạc lịch sử",
        "phỉ báng lãnh tụ",
        "bôi nhọ danh dự",
        "vu khống nhà lãnh đạo"
      ],
      "safe_rewrite": "Thảo luận lịch sử cần dựa trên tài liệu chính thống và tôn trọng sự thật.",
      "embedding_text": "Xuyên tạc lịch sử và phỉ báng lãnh tụ trên mạng xã hội"
    },
    {
      "id": "case-2024-010",
      "source_type": "press_report",
      "category": "defamation",
      "severity": "high",
      "summary": "Tố cáo cá nhân có hành vi tham nhũng nhưng không có bằng chứng, kèm kêu gọi tẩy chay.",
      "violation_phrases": [
        "ông này tham nhũng",
        "bà này ăn cắp",
        "phản bội lợi ích dân tộc",
        "bán nước"
      ],
      "safe_rewrite": "Các cáo buộc nghiêm trọng cần bằng chứng và kênh tố cáo chính thức thay vì đăng công khai.",
      "embedding_text": "Tố cáo cá nhân tham nhũng không bằng chứng kèm kêu gọi tẩy chay"
    },
    {
      "id": "case-2024-011",
      "source_type": "official_announcement",
      "category": "decree_15_2020",
      "severity": "high",
      "summary": "Tung tin giả về thiên tai lũ lụt gây hoang mang cho ngưới dân vùng lũ.",
      "violation_phrases": [
        "vỡ đập ở",
        "lũ lụt kinh hoàng",
        "ngưới chết hàng trăm",
        "thiên tai chưa kiểm chứng"
      ],
      "safe_rewrite": "Thông tin về thiên tai cần dẫn nguồn từ Ban Chỉ đạo Phòng chống thiên tai hoặc cơ quan chức năng.",
      "embedding_text": "Tung tin giả về thiên tai lũ lụt gây hoang mang"
    },
    {
      "id": "case-2024-012",
      "source_type": "press_report",
      "category": "synthetic_media",
      "severity": "high",
      "summary": "Chia sẻ ảnh AI-generated giả mạo tai nạn giao thông để câu tương tác.",
      "violation_phrases": [
        "ảnh do AI tạo ra",
        "hình ảnh giả mạo tai nạn",
        "sửa bằng AI",
        "deepfake để câu view"
      ],
      "safe_rewrite": "Hình ảnh/video có dấu hiệu chỉnh sửa AI cần được ghi nhãn rõ ràng.",
      "embedding_text": "Chia sẻ ảnh AI-generated giả mạo tai nạn giao thông"
    },
    {
      "id": "case-2024-013",
      "source_type": "official_announcement",
      "category": "cybersecurity_law",
      "severity": "critical",
      "summary": "Tuyên truyền, xuyên tạc chính sách của Đảng và Nhà nước trên mạng xã hội.",
      "violation_phrases": [
        "xuyên tạc chủ trương",
        "bôi nhọ chính quyền",
        "tuyên truyền chống phá",
        "phá hoại khối đại đoàn kết"
      ],
      "safe_rewrite": "Phản ánh chính sách nên dựa trên văn bản chính thức và ngôn ngữ xây dựng.",
      "embedding_text": "Tuyên truyền xuyên tạc chính sách của Đảng và Nhà nước"
    },
    {
      "id": "case-2024-014",
      "source_type": "press_report",
      "category": "unverified_rumor",
      "severity": "medium",
      "summary": "Lan truyền tin đồn về việc đóng cửa sân bay khi chưa có thông báo chính thức.",
      "violation_phrases": [
        "sân bay sắp đóng cửa",
        "nghe đồn hủy chuyến bay hàng loạt",
        "chưa kiểm chứng nhưng chia sẻ ngay",
        "tin nội bộ"
      ],
      "safe_rewrite": "Thông tin về hàng không cần được kiểm chứng qua website của sân bay hoặc hãng bay.",
      "embedding_text": "Lan truyền tin đồn đóng cửa sân bay chưa có thông báo chính thức"
    },
    {
      "id": "case-2024-015",
      "source_type": "official_announcement",
      "category": "decree_72",
      "severity": "medium",
      "summary": "Đăng nội dung xúc phạm, lăng mạ cá nhân trên mạng xã hội.",
      "violation_phrases": [
        "xúc phạm danh dự",
        "lăng mạ cá nhân",
        "bôi nhọ nhân phẩm",
        "chửi rỉa công khai"
      ],
      "safe_rewrite": "Tranh luận nên tập trung vào vấn đề, tránh xúc phạm cá nhân.",
      "embedding_text": "Đăng nội dung xúc phạm lăng mạ cá nhân trên mạng xã hội"
    },
    {
      "id": "case-2024-016",
      "source_type": "press_report",
      "category": "doxxing",
      "severity": "high",
      "summary": "Đăng ảnh chụp biển số xe và kêu gọi cộng đồng tìm danh tính tài xế.",
      "violation_phrases": [
        "biển số xe này",
        "tìm danh tính tài xế",
        "công khai thông tin cá nhân",
        "mọi ngưới hãy tìm ngưới này"
      ],
      "safe_rewrite": "Nếu gặp sự cố giao thông, hãy báo cáo cơ quan chức năng thay vì tự tìm kiếm cá nhân.",
      "embedding_text": "Đăng ảnh biển số xe và kêu gọi tìm danh tính tài xế"
    },
    {
      "id": "case-2024-017",
      "source_type": "official_announcement",
      "category": "synthetic_media",
      "severity": "medium",
      "summary": "Phát tán hình ảnh được chỉnh sửa bằng AI tạo cảnh bạo lực giả mạo.",
      "violation_phrases": [
        "ảnh bạo lực do AI tạo",
        "hình ảnh bị ghép",
        "video cảnh bạo lực giả",
        "synthetic media"
      ],
      "safe_rewrite": "Nội dung có dấu hiệu tổng hợp AI cần được ghi nhãn và xác minh trước khi chia sẻ.",
      "embedding_text": "Phát tán hình ảnh AI tạo cảnh bạo lực giả mạo"
    },
    {
      "id": "case-2024-018",
      "source_type": "press_report",
      "category": "defamation",
      "severity": "medium",
      "summary": "Cáo buộc một cơ sở kinh doanh bán hàng giả mà không có kết luận của cơ quan chức năng.",
      "violation_phrases": [
        "quán này bán hàng giả",
        "nhà hàng này bẩn",
        "cơ sở này lừa đảo",
        "cảnh báo không ai được đến"
      ],
      "safe_rewrite": "Tôi có một số lo ngại về chất lượng dịch vụ tại đây và sẽ phản ánh qua kênh phù hợp.",
      "embedding_text": "Cáo buộc cơ sở kinh doanh bán hàng giả không có bằng chứng"
    },
    {
      "id": "case-2024-019",
      "source_type": "official_announcement",
      "category": "cybersecurity_law",
      "severity": "critical",
      "summary": "Kêu gọi tham gia hoạt động khủng bố hoặc ủng hộ tổ chức khủng bố trên mạng.",
      "violation_phrases": [
        "ủng hộ tổ chức khủng bố",
        "kêu gọi khủng bố",
        "tuyên truyền bạo lực",
        "chiến tranh tôn giáo"
      ],
      "safe_rewrite": "Không đăng nội dung liên quan đến khủng bố, bạo lực cực đoan hoặc kích động thù hận.",
      "embedding_text": "Kêu gọi tham gia hoạt động khủng bố trên mạng xã hội"
    },
    {
      "id": "case-2024-020",
      "source_type": "press_report",
      "category": "unverified_rumor",
      "severity": "low",
      "summary": "Chia sẻ tin đồn về việc tăng giá xăng trước khi có thông báo chính thức.",
      "violation_phrases": [
        "nghe nói xăng sắp tăng giá",
        "đồn rằng giá xăng tăng mạnh",
        "tin nội bộ về giá xăng",
        "chưa kiểm chứng"
      ],
      "safe_rewrite": "Thông tin về giá xăng cần chờ thông báo từ Bộ Công Thương và Bộ Tài chính.",
      "embedding_text": "Chia sẻ tin đồn tăng giá xăng trước thông báo chính thức"
    }
  ]
};

  if (typeof globalThis !== "undefined") {
    globalThis.SafePostCaseCorpus = SAFE_POST_CASE_CORPUS;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
