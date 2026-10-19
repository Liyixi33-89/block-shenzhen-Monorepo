package com.blocksz.server.tools;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * 数据迁移：旧服务 SQLite → MySQL。
 * 直接按表复制（表结构兼容：users/saves/scenes/events/rollout/creations）。
 * scenes 的插入序：按 rowid 保持发布顺序写入 seq。
 *
 * 用法：java -cp <jar> com.blocksz.server.tools.DataMigrator <src.sqlite> <mysql-url> <user> <pass>
 */
public final class DataMigrator {

    public static void main(String[] args) throws Exception {
        if (args.length < 4) {
            System.err.println("usage: DataMigrator <src.sqlite> <mysql-url> <user> <pass>");
            System.exit(2);
        }
        Path src = Path.of(args[0]);
        if (!Files.exists(src)) {
            System.err.println("source db not found: " + src);
            System.exit(1);
        }

        // 显式加载驱动（避免依赖 SPI 自动发现）
        Class.forName("org.sqlite.JDBC");
        Class.forName("com.mysql.cj.jdbc.Driver");

        try (Connection in = DriverManager.getConnection("jdbc:sqlite:" + src.toAbsolutePath());
             Connection out = DriverManager.getConnection(args[1], args[2], args[3])) {
            out.setAutoCommit(false);
            // 目标库建表（与应用启动脚本一致）
            String schema = Files.readString(Path.of(DataMigrator.class
                    .getResource("/schema.sql").toURI()), StandardCharsets.UTF_8);
            try (Statement st = out.createStatement()) {
                for (String s : schema.split(";")) {
                    String sql = stripComments(s.strip());
                    if (!sql.isEmpty()) st.execute(sql);
                }
            }

            int users = copy(in, out, "users",
                    """
                    INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?,?,?,?,?)
                    ON DUPLICATE KEY UPDATE username = VALUES(username), password_hash = VALUES(password_hash),
                        role = VALUES(role), created_at = VALUES(created_at)
                    """,
                    rs -> new Object[]{rs.getString("id"), rs.getString("username"), rs.getString("password_hash"),
                            rs.getString("role"), rs.getString("created_at")});

            int saves = copy(in, out, "saves",
                    """
                    INSERT INTO saves (player_id, payload, updated_at) VALUES (?,?,?)
                    ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = VALUES(updated_at)
                    """,
                    rs -> new Object[]{rs.getString("player_id"), rs.getString("payload"), rs.getString("updated_at")});

            int scenes = copy(in, out, "scenes",
                    """
                    INSERT INTO scenes (scene_id, kind, version, payload, seq) VALUES (?,?,?,?,?)
                    ON DUPLICATE KEY UPDATE payload = VALUES(payload), seq = VALUES(seq)
                    """,
                    rs -> new Object[]{rs.getString("scene_id"), rs.getString("kind"), rs.getString("version"),
                            rs.getString("payload"), rs.getRow()});

            int events = copy(in, out, "events",
                    "INSERT INTO events (ts, player_id, name, scene_version, props) VALUES (?,?,?,?,?)",
                    rs -> new Object[]{rs.getString("ts"), rs.getString("player_id"), rs.getString("name"),
                            rs.getString("scene_version"), rs.getString("props")});

            int rollout = copy(in, out, "rollout",
                    """
                    INSERT INTO rollout (scene_id, pinned_version, gray_percent, updated_at) VALUES (?,?,?,?)
                    ON DUPLICATE KEY UPDATE pinned_version = VALUES(pinned_version),
                        gray_percent = VALUES(gray_percent), updated_at = VALUES(updated_at)
                    """,
                    rs -> new Object[]{rs.getString("scene_id"), rs.getString("pinned_version"),
                            rs.getInt("gray_percent"), rs.getString("updated_at")});

            int creations = copy(in, out, "creations",
                    """
                    INSERT INTO creations (id, player_id, player_name, title, `desc`, placements, likes, likers, created_at)
                    VALUES (?,?,?,?,?,?,?,?,?)
                    ON DUPLICATE KEY UPDATE player_id = VALUES(player_id), player_name = VALUES(player_name),
                        title = VALUES(title), `desc` = VALUES(`desc`), placements = VALUES(placements),
                        likes = VALUES(likes), likers = VALUES(likers), created_at = VALUES(created_at)
                    """,
                    rs -> new Object[]{rs.getString("id"), rs.getString("player_id"), rs.getString("player_name"),
                            rs.getString("title"), rs.getString("desc"), rs.getString("placements"),
                            rs.getInt("likes"), rs.getString("likers"), rs.getString("created_at")});

            out.commit();
            System.out.printf("[migrate] users=%d saves=%d scenes=%d events=%d rollout=%d creations=%d%n",
                    users, saves, scenes, events, rollout, creations);
            System.out.println("[migrate] done -> " + args[1]);
        }
    }

    @FunctionalInterface
    private interface RowMapper {
        Object[] map(ResultSet rs) throws java.sql.SQLException;
    }

    private static int copy(Connection in, Connection out, String table, String insert, RowMapper mapper)
            throws Exception {
        String cols = switch (table) {
            case "users" -> "id, username, password_hash, role, created_at";
            case "saves" -> "player_id, payload, updated_at";
            case "scenes" -> "scene_id, kind, version, payload";
            case "events" -> "ts, player_id, name, scene_version, props";
            case "rollout" -> "scene_id, pinned_version, gray_percent, updated_at";
            case "creations" -> "id, player_id, player_name, title, desc, placements, likes, likers, created_at";
            default -> throw new IllegalArgumentException(table);
        };
        String order = "scenes".equals(table) ? " ORDER BY rowid" : "";
        int n = 0;
        try (Statement st = in.createStatement();
             ResultSet rs = st.executeQuery("SELECT " + cols + " FROM " + table + order);
             PreparedStatement ps = out.prepareStatement(insert)) {
            while (rs.next()) {
                Object[] row = mapper.map(rs);
                for (int i = 0; i < row.length; i++) {
                    // scenes.seq 占位：rs.getRow() 已在 mapper 内处理
                    ps.setObject(i + 1, row[i]);
                }
                ps.executeUpdate();
                n++;
            }
        }
        return n;
    }

    private static String stripComments(String sql) {
        StringBuilder sb = new StringBuilder();
        for (String line : sql.split("\n")) {
            String t = line.strip();
            if (t.startsWith("--")) continue;
            sb.append(line).append('\n');
        }
        return sb.toString().strip();
    }

    private DataMigrator() {}
}
