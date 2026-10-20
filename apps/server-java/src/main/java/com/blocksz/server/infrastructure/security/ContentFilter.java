package com.blocksz.server.infrastructure.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * P0 UGC 内容安全：敏感词过滤（最小可行实现）。
 * - 词表来源：环境变量 BSZ_SENSITIVE_WORDS（逗号分隔），
 *   生产环境接第三方内容安全 API（阿里绿网/网易易盾）时替换 scan 实现，调用方契约不变；
 * - 处置策略：命中即拒绝发布（reject），不做人肉替换（避免「*」绕过式规避误导审核）；
 * - 变形对抗：全角→半角、去空白后匹配（对抗「敏 感 词」「敏感　词」类插空绕过）。
 */
@Component
public class ContentFilter {

    private final List<String> words;

    public ContentFilter(@Value("${BSZ_SENSITIVE_WORDS:}") String csv) {
        this.words = (csv == null || csv.isBlank()) ? List.of()
                : Arrays.stream(csv.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .map(String::toLowerCase)
                        .toList();
    }

    /** 是否已配置词表（未配置 = 放行并记录告警由运维侧保障）。 */
    public boolean enabled() {
        return !words.isEmpty();
    }

    /**
     * 扫描文本：返回命中的敏感词列表（空 = 干净）。
     * 归一化：小写 + 全角转半角 + 去所有空白字符。
     */
    public List<String> scan(String text) {
        if (text == null || text.isBlank() || words.isEmpty()) return List.of();
        String normalized = normalize(text);
        List<String> hits = new ArrayList<>();
        for (String w : words) {
            if (normalized.contains(w)) hits.add(w);
        }
        return hits;
    }

    /** 拒绝发布判定：命中任一词即 true。 */
    public boolean reject(String text) {
        return !scan(text).isEmpty();
    }

    private static String normalize(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (char c : s.toCharArray()) {
            // 全角 ASCII → 半角
            if (c >= 0xFF01 && c <= 0xFF5E) c = (char) (c - 0xFEE0);
            else if (c == 0x3000) c = ' ';   // 全角空格
            if (!Character.isWhitespace(c)) {
                sb.append(Character.toLowerCase(c));
            }
        }
        return sb.toString();
    }
}
