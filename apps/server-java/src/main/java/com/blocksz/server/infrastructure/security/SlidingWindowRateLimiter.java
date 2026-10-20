package com.blocksz.server.infrastructure.security;

import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * P0 限流：内存滑动窗口（按 key 维度）。
 * 用途：登录接口防暴力破解、注册接口防机器人批量灌注册。
 *
 * 设计取舍：
 *  - 单机内存实现（当前部署形态单实例）；上集群时换 Redis 令牌桶，接口不变；
 *  - 滑动窗口而非固定窗口：避免窗口边界的双倍突发；
 *  - key 形如 "login:username"、"register:ip"，命中窗口计数超限即拒绝。
 */
@Component
public class SlidingWindowRateLimiter {

    private static final int MAX_TRACKED_KEYS = 10_000;

    private final Map<String, Deque<Long>> hits = new ConcurrentHashMap<>();

    /**
     * 尝试通过限流。
     * @param key 维度键（如 login:alice / register:1.2.3.4）
     * @param limit 窗口内允许的最大次数
     * @param windowMs 窗口长度（毫秒）
     * @return true = 放行；false = 超限拒绝
     */
    public boolean tryAcquire(String key, int limit, long windowMs) {
        long now = System.currentTimeMillis();
        Deque<Long> q = hits.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            // 淘汰窗口外记录
            while (!q.isEmpty() && now - q.peekFirst() >= windowMs) {
                q.pollFirst();
            }
            if (q.size() >= limit) {
                return false;
            }
            q.addLast(now);
            return true;
        }
    }

    /** 防内存膨胀：key 数超过上限时清理（简单粗暴整体清空，攻击者刷随机 key 时触发）。 */
    public void trimIfNeeded() {
        if (hits.size() > MAX_TRACKED_KEYS) {
            hits.clear();
        }
    }
}
