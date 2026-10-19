package com.blocksz.server.domain.analytics;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Analytics 上下文实体：埋点事件（不可变）。
 * 服务端时间戳为准；props 白名单清洗规则固化在实体工厂中。
 */
public record TrackingEvent(
        String ts,
        String playerId,
        String name,
        String sceneVersion,
        Map<String, Object> props) {

    /** 白名单清洗：name ≤64；props ≤20 项，key ≤32，字符串值 ≤128，数值需有限。 */
    public static TrackingEvent of(String ts, String playerId, String name,
                                   String sceneVersion, Map<String, ?> rawProps) {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("event name required");
        Map<String, Object> clean = new LinkedHashMap<>();
        if (rawProps != null) {
            int i = 0;
            for (var e : rawProps.entrySet()) {
                if (i++ >= 20) break;
                String k = truncate(e.getKey(), 32);
                Object v = e.getValue();
                if (v instanceof String s) clean.put(k, truncate(s, 128));
                else if (v instanceof Double d && Double.isFinite(d)) clean.put(k, d);
                else if (v instanceof Number n) clean.put(k, n.doubleValue());
                else if (v instanceof Boolean b) clean.put(k, b);
            }
        }
        return new TrackingEvent(ts, playerId, truncate(name, 64),
                truncate(sceneVersion == null ? "" : sceneVersion, 32), clean);
    }

    private static String truncate(String s, int max) {
        return s == null ? "" : (s.length() <= max ? s : s.substring(0, max));
    }

    // ---- 查询侧值对象 ----

    /** 事件聚合行（overview）。 */
    public record EventSummary(String name, long total, long players, long today,
                               List<Sample> samples) {
        public record Sample(String ts, Map<String, Object> props) {}
    }

    /** 漏斗步骤。 */
    public record FunnelStep(String name, long players, double rate) {}

    /** DAU 行。 */
    public record DauRow(String day, long players) {}
}
