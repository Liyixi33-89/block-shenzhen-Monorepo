package com.blocksz.server.infrastructure.persistence;

import com.blocksz.server.domain.creation.Creation;
import com.blocksz.server.domain.creation.CreationRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** CreationRepository 的 MySQL/JDBC 适配器。 */
@Repository
public class JdbcCreationRepository implements CreationRepository {

    private static final ObjectMapper M = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> PLACEMENTS = new TypeReference<>() {};
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    private final JdbcTemplate jdbc;

    public JdbcCreationRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void save(Creation c) {
        jdbc.update("""
                INSERT INTO creations (id, player_id, player_name, title, `desc`, placements, likes, likers, created_at)
                VALUES (?,?,?,?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE player_id = VALUES(player_id), player_name = VALUES(player_name),
                    title = VALUES(title), `desc` = VALUES(`desc`), placements = VALUES(placements),
                    likes = VALUES(likes), likers = VALUES(likers), created_at = VALUES(created_at)
                """, c.id(), c.playerId(), c.playerName(), c.title(), c.desc(),
                JsonColumns.write(c.placements()), c.likes(), JsonColumns.write(c.likers()), c.createdAt());
    }

    @Override
    public void saveLike(Creation c) {
        jdbc.update("UPDATE creations SET likes = ?, likers = ? WHERE id = ?",
                c.likes(), JsonColumns.write(c.likers()), c.id());
    }

    @Override
    public Optional<Creation> findById(String id) {
        List<Creation> rows = jdbc.query(allColumns() + " WHERE id = ?", this::map, id);
        return rows.stream().findFirst();
    }

    @Override
    public List<Creation> list(String sort, int limit) {
        String order = "hot".equals(sort)
                ? " ORDER BY likes DESC, created_at DESC"
                : " ORDER BY created_at DESC";
        return jdbc.query(allColumns() + order + " LIMIT ?", this::map, limit);
    }

    private String allColumns() {
        return "SELECT id, player_id, player_name, title, `desc`, placements, likes, likers, created_at FROM creations";
    }

    private Creation map(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        try {
            return new Creation(rs.getString("id"), rs.getString("player_id"), rs.getString("player_name"),
                    rs.getString("title"), rs.getString("desc"),
                    M.readValue(rs.getString("placements"), PLACEMENTS),
                    rs.getInt("likes"),
                    M.readValue(rs.getString("likers"), STRING_LIST),
                    rs.getString("created_at"));
        } catch (Exception e) {
            throw new IllegalStateException("creation row decode failed", e);
        }
    }
}
