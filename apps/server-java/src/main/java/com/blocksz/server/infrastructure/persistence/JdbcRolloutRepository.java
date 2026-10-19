package com.blocksz.server.infrastructure.persistence;

import com.blocksz.server.domain.rollout.RolloutConfig;
import com.blocksz.server.domain.rollout.RolloutRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/** RolloutRepository 的 MySQL/JDBC 适配器。 */
@Repository
public class JdbcRolloutRepository implements RolloutRepository {

    private final JdbcTemplate jdbc;

    public JdbcRolloutRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void save(RolloutConfig cfg) {
        jdbc.update("""
                INSERT INTO rollout (scene_id, pinned_version, gray_percent, updated_at) VALUES (?,?,?,?)
                ON DUPLICATE KEY UPDATE pinned_version = VALUES(pinned_version),
                    gray_percent = VALUES(gray_percent), updated_at = VALUES(updated_at)
                """,
                cfg.sceneId(), cfg.pinnedVersion(), cfg.grayPercent(), Instant.now().toString());
    }

    @Override
    public Optional<RolloutConfig> findBySceneId(String sceneId) {
        List<RolloutConfig> rows = jdbc.query(
                "SELECT scene_id, pinned_version, gray_percent FROM rollout WHERE scene_id = ?",
                (rs, i) -> new RolloutConfig(rs.getString(1), rs.getString(2), rs.getInt(3)),
                sceneId);
        return rows.stream().findFirst();
    }
}
