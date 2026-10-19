package com.blocksz.server.infrastructure.persistence;

import com.blocksz.server.domain.identity.User;
import com.blocksz.server.domain.identity.UserRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** UserRepository 的 MySQL/JDBC 适配器。 */
@Repository
public class JdbcUserRepository implements UserRepository {

    private final JdbcTemplate jdbc;

    public JdbcUserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void save(User u) {
        jdbc.update("""
                INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?,?,?,?,?)
                ON DUPLICATE KEY UPDATE username = VALUES(username), password_hash = VALUES(password_hash),
                    role = VALUES(role), created_at = VALUES(created_at)
                """,
                u.id(), u.username(), u.passwordHash(), u.role().name().toLowerCase(), u.createdAt());
    }

    @Override
    public Optional<User> findById(String id) {
        List<User> rows = jdbc.query(
                "SELECT id, username, password_hash, role, created_at FROM users WHERE id = ?",
                (rs, i) -> map(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5)),
                id);
        return rows.stream().findFirst();
    }

    @Override
    public Optional<User> findByUsername(String username) {
        List<User> rows = jdbc.query(
                "SELECT id, username, password_hash, role, created_at FROM users WHERE username = ?",
                (rs, i) -> map(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5)),
                username);
        return rows.stream().findFirst();
    }

    @Override
    public boolean existsAny() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM users", Long.class);
        return n != null && n > 0;
    }

    @Override
    public long count() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM users", Long.class);
        return n == null ? 0 : n;
    }

    private User map(String id, String username, String hash, String role, String createdAt) {
        return new User(id, username, hash, "admin".equals(role) ? User.Role.ADMIN : User.Role.PLAYER, createdAt);
    }
}
