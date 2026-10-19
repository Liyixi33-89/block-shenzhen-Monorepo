package com.blocksz.server.infrastructure.persistence;

import com.blocksz.server.domain.save.PlayerSave;
import com.blocksz.server.domain.save.PlayerSaveRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** PlayerSaveRepository 的 MySQL/JDBC 适配器。 */
@Repository
public class JdbcSaveRepository implements PlayerSaveRepository {

    private final JdbcTemplate jdbc;

    public JdbcSaveRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void save(PlayerSave save) {
        jdbc.update("""
                INSERT INTO saves (player_id, payload, updated_at) VALUES (?,?,?)
                ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = VALUES(updated_at)
                """,
                save.playerId(), JsonColumns.write(save.payload()), save.updatedAt());
    }

    @Override
    public Optional<PlayerSave> findByPlayerId(String playerId) {
        List<PlayerSave> rows = jdbc.query(
                "SELECT player_id, payload, updated_at FROM saves WHERE player_id = ?",
                (rs, i) -> new PlayerSave(rs.getString(1), JsonColumns.readMap(rs.getString(2)), rs.getString(3)),
                playerId);
        return rows.stream().findFirst();
    }

    @Override
    public void deleteByPlayerId(String playerId) {
        jdbc.update("DELETE FROM saves WHERE player_id = ?", playerId);
    }
}
