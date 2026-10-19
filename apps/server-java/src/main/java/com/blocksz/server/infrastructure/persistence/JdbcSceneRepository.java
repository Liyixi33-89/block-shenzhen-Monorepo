package com.blocksz.server.infrastructure.persistence;

import com.blocksz.server.domain.content.SceneAggregate;
import com.blocksz.server.domain.content.SceneRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * SceneRepository 的 MySQL/JDBC 适配器。
 * 表 scenes 主键 (scene_id, kind, version)；seq 列保持发布插入序（显式自增）。
 */
@Repository
public class JdbcSceneRepository implements SceneRepository {

    private final JdbcTemplate jdbc;

    public JdbcSceneRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void saveDraft(String sceneId, Map<String, Object> payload, String version) {
        int next = nextSeq(sceneId);
        jdbc.update("""
                INSERT INTO scenes (scene_id, kind, version, payload, seq)
                VALUES (?, 'draft', ?, ?, ?)
                ON DUPLICATE KEY UPDATE payload = VALUES(payload), seq = VALUES(seq)
                """, sceneId, version, JsonColumns.write(payload), next);
    }

    @Override
    public void addPublished(String sceneId, String version, Map<String, Object> payload) {
        int next = nextSeq(sceneId);
        jdbc.update("""
                INSERT INTO scenes (scene_id, kind, version, payload, seq)
                VALUES (?, 'published', ?, ?, ?)
                ON DUPLICATE KEY UPDATE payload = VALUES(payload), seq = VALUES(seq)
                """, sceneId, version, JsonColumns.write(payload), next);
    }

    /** 下一个 seq：先查 MAX(seq)+1，避免子查询引用目标表（MySQL 限制）。 */
    private int nextSeq(String sceneId) {
        Integer max = jdbc.queryForObject(
                "SELECT COALESCE(MAX(seq),0) FROM scenes WHERE scene_id = ?", Integer.class, sceneId);
        return (max == null ? 0 : max) + 1;
    }

    @Override
    public Optional<SceneAggregate> load(String sceneId) {
        List<Row> rows = jdbc.query("""
                SELECT kind, version, payload FROM scenes WHERE scene_id = ? ORDER BY seq
                """, (rs, i) -> new Row(rs.getString(1), rs.getString(2), rs.getString(3)), sceneId);
        if (rows.isEmpty()) return Optional.empty();

        Map<String, Object> draft = null;
        List<SceneAggregate.PublishedVersion> published = new ArrayList<>();
        for (Row r : rows) {
            if ("draft".equals(r.kind)) {
                draft = JsonColumns.readMap(r.payload);
            } else {
                published.add(new SceneAggregate.PublishedVersion(r.version, JsonColumns.readMap(r.payload)));
            }
        }
        return Optional.of(SceneAggregate.rehydrate(sceneId, draft, published));
    }

    private record Row(String kind, String version, String payload) {}
}
