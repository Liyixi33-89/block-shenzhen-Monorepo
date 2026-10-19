package com.blocksz.server.domain.identity;

import com.blocksz.server.domain.shared.DomainException;

import java.util.UUID;

/**
 * Identity 上下文聚合根：用户。
 * 业务规则：用户名 2-24 字符；角色 admin/player；首个用户授予 admin。
 */
public class User {
    private final String id;
    private String username;
    /** 格式：pbkdf2$iterations$salt$hash（新）/ scrypt$salt$hash / sha256hex（旧，登录时升级） */
    private String passwordHash;
    private Role role;
    private final String createdAt;

    public enum Role { PLAYER, ADMIN }

    public User(String id, String username, String passwordHash, Role role, String createdAt) {
        this.id = id;
        this.username = username;
        this.passwordHash = passwordHash;
        this.role = role;
        this.createdAt = createdAt;
    }

    /** 注册新用户；首个用户（isFirst）自动授予 admin。 */
    public static User register(String username, String passwordHash, boolean isFirst, String now) {
        if (username == null || username.length() < 2 || username.length() > 24) {
            throw DomainException.invalid("username must be 2-24 chars");
        }
        return new User(UUID.randomUUID().toString(), username, passwordHash,
                isFirst ? Role.ADMIN : Role.PLAYER, now);
    }

    /** 更新密码哈希（旧格式升级）。 */
    public void upgradePassword(String newHash) {
        this.passwordHash = newHash;
    }

    public boolean isAdmin() { return role == Role.ADMIN; }

    public String id() { return id; }
    public String username() { return username; }
    public String passwordHash() { return passwordHash; }
    public Role role() { return role; }
    public String createdAt() { return createdAt; }
}
