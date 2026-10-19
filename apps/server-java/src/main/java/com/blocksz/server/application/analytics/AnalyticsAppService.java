package com.blocksz.server.application.analytics;

import com.blocksz.server.domain.analytics.EventRepository;
import com.blocksz.server.domain.analytics.TrackingEvent;
import com.blocksz.server.domain.shared.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Analytics 用例：批量上报 / 事件总览 / 漏斗 / DAU。 */
@Service
public class AnalyticsAppService {

    private final EventRepository events;

    public AnalyticsAppService(EventRepository events) {
        this.events = events;
    }

    /** 批量上报（playerId 来自 JWT；服务端时间戳）。 */
    @Transactional
    public Map<String, Object> collect(String playerId, List<Map<String, Object>> rawEvents) {
        if (rawEvents == null || rawEvents.isEmpty()) return Map.of("ok", true, "accepted", 0);
        if (rawEvents.size() > 100) throw DomainException.invalid("too many events per batch");
        String ts = Instant.now().toString();
        List<TrackingEvent> clean = new ArrayList<>();
        for (Map<String, Object> e : rawEvents) {
            Object name = e == null ? null : e.get("name");
            if (!(name instanceof String s) || s.isBlank() || s.length() > 64) continue;
            Object sv = e.get("sceneVersion");
            Object props = e.get("props");
            clean.add(TrackingEvent.of(ts, playerId, s,
                    sv == null ? "" : String.valueOf(sv),
                    props instanceof Map<?, ?> m ? (Map<String, ?>) m : Map.of()));
        }
        events.saveAll(clean);
        return Map.of("ok", true, "accepted", clean.size());
    }

    /** 事件总览（近 N 天）。 */
    public Map<String, Object> overview(int days) {
        String since = sinceIso(days);
        List<String> names = events.recentEventNames(since);
        String todayKey = LocalDate.now().toString();
        List<Map<String, Object>> out = new ArrayList<>();
        for (String name : names) {
            List<TrackingEvent> rows = events.findByNameSince(name, since, 2000);
            if (rows.isEmpty()) continue;
            Set<String> players = new HashSet<>();
            long today = 0;
            for (TrackingEvent r : rows) {
                players.add(r.playerId());
                if (r.ts().startsWith(todayKey)) today++;
            }
            List<Map<String, Object>> samples = rows.stream().limit(5)
                    .map(r -> Map.<String, Object>of("ts", r.ts(), "props", r.props()))
                    .toList();
            out.add(Map.of("name", (Object) name, "total", (Object) (long) rows.size(),
                    "players", (Object) (long) players.size(), "today", (Object) (long) today, "samples", (Object) samples));
        }
        out.sort((x, y) -> Long.compare((Long) y.get("total"), (Long) x.get("total")));        return Map.of("events", out);
    }

    /** 漏斗（步骤事件序列转化）。 */
    public Map<String, Object> funnel(List<String> steps, int days) {
        if (steps == null || steps.size() < 2) {
            throw DomainException.invalid("steps must be >= 2 event names");
        }
        String since = sinceIso(days);
        List<TrackingEvent.FunnelStep> out = new ArrayList<>();
        long first = 0;
        for (int i = 0; i < steps.size(); i++) {
            long players = events.countDistinctPlayers(steps.get(i), since);
            if (i == 0) first = players;
            double rate = first == 0 ? 0 : (double) players / first;
            out.add(new TrackingEvent.FunnelStep(steps.get(i), players, i == 0 ? 1.0 : rate));
        }
        return Map.of("funnel", out);
    }

    /** DAU（近 N 天）。 */
    public Map<String, Object> dau(int days) {
        return Map.of("dau", events.dailyActiveUsers(sinceIso(days), days));
    }

    private static String sinceIso(int days) {
        return Instant.now().minusSeconds((long) days * 86400).toString();
    }
}
