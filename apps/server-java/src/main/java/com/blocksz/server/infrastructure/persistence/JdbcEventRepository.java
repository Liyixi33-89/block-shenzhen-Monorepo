package com.blocksz.server.infrastructure.persistence;

import com.blocksz.server.domain.analytics.EventRepository;
import com.blocksz.server.domain.analytics.TrackingEvent;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** EventRepository 的 MySQL/JDBC 适配器（批量插入 + 聚合查询）。 */
@Repository
public class JdbcEventRepository implements EventRepository {

    private static final ObjectMapper M = new ObjectMapper();
    private static final TypeReference<LinkedHashMap<String, Object>> MAP = new TypeReference<>() {};

    private final JdbcTemplate jdbc;

    public JdbcEventRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void saveAll(List<TrackingEvent> events) {
        jdbc.batchUpdate(
                "INSERT INTO events (ts, player_id, name, scene_version, props) VALUES (?,?,?,?,?)",
                events.stream().map(e -> new Object[]{
                        e.ts(), e.playerId(), e.name(), e.sceneVersion(), JsonColumns.write(e.props())
                }).toList());
    }

    @Override
    public List<String> recentEventNames(String sinceIso) {
        return jdbc.queryForList(
                "SELECT DISTINCT name FROM events WHERE ts >= ? LIMIT 50", String.class, sinceIso);
    }

    @Override
    public List<TrackingEvent> findByNameSince(String name, String sinceIso, int limit) {
        return jdbc.query("""
                SELECT ts, player_id, name, scene_version, props FROM events
                WHERE name = ? AND ts >= ? ORDER BY ts DESC LIMIT ?
                """, (rs, i) -> new TrackingEvent(rs.getString(1), rs.getString(2), rs.getString(3),
                rs.getString(4), readProps(rs.getString(5))), name, sinceIso, limit);
    }

    @Override
    public long countDistinctPlayers(String name, String sinceIso) {
        Long n = jdbc.queryForObject(
                "SELECT COUNT(DISTINCT player_id) FROM events WHERE name = ? AND ts >= ?",
                Long.class, name, sinceIso);
        return n == null ? 0 : n;
    }

    @Override
    public List<TrackingEvent.DauRow> dailyActiveUsers(String sinceIso, int days) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT substr(ts, 1, 10) AS day, COUNT(DISTINCT player_id) AS n
                FROM events WHERE ts >= ? GROUP BY day ORDER BY day
                """, sinceIso);
        List<TrackingEvent.DauRow> out = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Object n = r.get("n");
            out.add(new TrackingEvent.DauRow(String.valueOf(r.get("day")),
                    n instanceof Number num ? num.longValue() : 0));
        }
        return out;
    }

    private static Map<String, Object> readProps(String json) {
        try {
            return json == null ? Map.of() : M.readValue(json, MAP);
        } catch (Exception e) {
            return Map.of();
        }
    }
}
