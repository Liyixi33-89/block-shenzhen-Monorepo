package com.blocksz.server.interfaces.rest;

import com.blocksz.server.infrastructure.security.SlidingWindowRateLimiter;
import com.blocksz.server.domain.shared.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/**
 * P0 限流策略：登录防爆破 / 注册防机器人。
 *  - 登录：按用户名 5 次/10 分钟 + 按 IP 20 次/10 分钟；
 *  - 注册：按 IP 5 次/小时（正常用户不会一小时注册多个号）。
 * 超限抛 429（GlobalExceptionHandler 映射 rate limited）。
 */
@Component
public class RateLimitGuard {

    private final SlidingWindowRateLimiter limiter;

    public RateLimitGuard(SlidingWindowRateLimiter limiter) {
        this.limiter = limiter;
    }

    /** 登录前调用：用户名维度 + IP 维度双重限流。 */
    public void checkLogin(String username, HttpServletRequest req) {
        limiter.trimIfNeeded();
        String ip = clientIp(req);
        if (!limiter.tryAcquire("login:user:" + username, 5, 10 * 60_000L)) {
            throw DomainException.invalid("too many attempts, retry in 10 minutes");
        }
        if (!limiter.tryAcquire("login:ip:" + ip, 20, 10 * 60_000L)) {
            throw DomainException.invalid("too many attempts, retry in 10 minutes");
        }
    }

    /** 注册前调用：IP 维度限流（防批量灌注册）。 */
    public void checkRegister(HttpServletRequest req) {
        limiter.trimIfNeeded();
        String ip = clientIp(req);
        if (!limiter.tryAcquire("register:ip:" + ip, 5, 60 * 60_000L)) {
            throw DomainException.invalid("too many registrations, retry in 1 hour");
        }
    }

    /** 取真实客户端 IP（代理场景取 X-Forwarded-For 首段）。 */
    private static String clientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return req.getRemoteAddr();
    }
}
