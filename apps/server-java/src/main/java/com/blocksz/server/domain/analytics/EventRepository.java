package com.blocksz.server.domain.analytics;

import java.time.Instant;
import java.util.List;

/** Analytics 上下文仓库接口（写 + 聚合查询）。 */
public interface EventRepository {
    void saveAll(List<TrackingEvent> events);

    /** 近 N 天事件名（去重，≤50）。 */
    List<String> recentEventNames(String sinceIso);

    /** 某事件近 N 天样本（≤2000，时间倒序）。 */
    List<TrackingEvent> findByNameSince(String name, String sinceIso, int limit);

    /** 某事件近 N 天去重玩家数。 */
    long countDistinctPlayers(String name, String sinceIso);

    /** DAU：按天去重玩家数。 */
    List<TrackingEvent.DauRow> dailyActiveUsers(String sinceIso, int days);

    /** 便捷：now 的 ISO 串。 */
    static String isoNow() { return Instant.now().toString(); }
}
