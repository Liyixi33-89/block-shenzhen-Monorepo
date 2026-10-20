package com.blocksz.server.application.moderation;

import com.blocksz.server.domain.shared.DomainException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * P0 内容审核用例：UGC 举报 / 举报队列 / 处置。
 * 举报开放给所有玩家（限流防滥用）；处置仅 admin。
 */
@Service
public class ModerationAppService {

    private final JdbcTemplate jdbc;
    private final com.blocksz.server.infrastructure.security.SlidingWindowRateLimiter limiter;

    public ModerationAppService(JdbcTemplate jdbc,
                                com.blocksz.server.infrastructure.security.SlidingWindowRateLimiter limiter) {
        this.jdbc = jdbc;
        this.limiter = limiter;
    }

    /** 玩家举报：kind=creation|player；同一玩家对同一目标去重 + 限流（5 次/小时）。 */
    @Transactional
    public Map<String, Object> report(String reporterId, String kind, String targetId, String reason) {
        if (!"creation".equals(kind) && !"player".equals(kind)) {
            throw DomainException.invalid("kind must be creation or player");
        }
        if (targetId == null || targetId.isBlank() || targetId.length() > 64) {
            throw DomainException.invalid("targetId invalid");
        }
        String r = reason == null ? "" : reason.trim();
        if (r.isEmpty() || r.length() > 500) {
            throw DomainException.invalid("reason must be 1-500 chars");
        }
        // 限流：单玩家每小时最多 5 次举报
        if (!limiter.tryAcquire("report:player:" + reporterId, 5, 60 * 60_000L)) {
            throw DomainException.invalid("too many reports, retry in 1 hour");
        }
        // 去重：同一玩家对同一目标只留一条 open 举报
        Integer dup = jdbc.queryForObject(
                "SELECT COUNT(*) FROM reports WHERE reporter_id = ? AND target_kind = ? AND target_id = ? AND status = 'open'",
                Integer.class, reporterId, kind, targetId);
        if (dup != null && dup > 0) {
            throw DomainException.conflict("already reported");
        }
        jdbc.update("INSERT INTO reports (target_kind, target_id, reporter_id, reason, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)",
                kind, targetId, reporterId, r, Instant.now().toString());
        return Map.of("ok", true);
    }

    /** admin：举报队列（默认 open，可按 status 过滤）。 */
    public Map<String, Object> queue(String status) {
        String st = "resolved".equals(status) || "dismissed".equals(status) ? status : "open";
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, target_kind, target_id, reporter_id, reason, status, created_at FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT 200",
                st);
        return Map.of("reports", rows);
    }

    /** admin：处置举报（resolved=处理 / dismissed=无效）。 */
    @Transactional
    public Map<String, Object> resolve(long id, String action) {
        String st = "resolved".equals(action) ? "resolved" : "dismissed";
        int n = jdbc.update("UPDATE reports SET status = ? WHERE id = ? AND status = 'open'", st, id);
        if (n == 0) throw DomainException.notFound("report not found or already handled");
        return Map.of("ok", true, "status", st);
    }
}
