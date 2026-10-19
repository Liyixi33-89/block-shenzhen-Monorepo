package com.blocksz.server.domain.creation;

import com.blocksz.server.domain.shared.DomainException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Creation 上下文聚合根：玩家建造作品。
 * 不变量：placements 1-500 项且每项合法；点赞同玩家去重；likers 与 likes 数一致。
 */
public class Creation {
    private final String id;
    private final String playerId;
    private final String playerName;
    private String title;
    private String desc;
    private final List<Map<String, Object>> placements;
    private int likes = 0;
    private final List<String> likers = new ArrayList<>();
    private final String createdAt;

    public Creation(String id, String playerId, String playerName, String title, String desc,
                    List<Map<String, Object>> placements, int likes,
                    List<String> likers, String createdAt) {
        this.id = id;
        this.playerId = playerId;
        this.playerName = playerName;
        this.title = title;
        this.desc = desc;
        this.placements = placements;
        this.likes = likes;
        this.likers.addAll(likers);
        this.createdAt = createdAt;
    }

    /** 发布新作品（placements 已在应用层校验）。 */
    public static Creation publish(String playerId, String playerName, String title, String desc,
                                   List<Map<String, Object>> placements) {
        String t = title == null ? "" : title.trim();
        if (t.length() < 2 || t.length() > 32) throw DomainException.invalid("title must be 2-32 chars");
        return new Creation(
                UUID.randomUUID().toString().substring(0, 8),
                playerId,
                playerName == null || playerName.isBlank() ? "游客" : truncate(playerName, 16),
                t,
                desc == null ? "" : truncate(desc.trim(), 120),
                placements, 0, List.of(), Instant.now().toString());
    }

    /** 点赞：同玩家同作品去重；返回是否成功。 */
    public boolean like(String playerId) {
        if (likers.contains(playerId)) return false;
        likers.add(playerId);
        likes++;
        return true;
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }

    public String id() { return id; }
    public String playerId() { return playerId; }
    public String playerName() { return playerName; }
    public String title() { return title; }
    public String desc() { return desc; }
    public List<Map<String, Object>> placements() { return placements; }
    public int likes() { return likes; }
    public List<String> likers() { return List.copyOf(likers); }
    public String createdAt() { return createdAt; }
}
