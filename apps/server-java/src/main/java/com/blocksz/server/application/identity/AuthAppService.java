package com.blocksz.server.application.identity;

import com.blocksz.server.domain.identity.PasswordEncoder;
import com.blocksz.server.domain.identity.TokenService;
import com.blocksz.server.domain.identity.User;
import com.blocksz.server.domain.identity.UserRepository;
import com.blocksz.server.domain.shared.DomainException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

/**
 * Identity 用例：注册 / 登录 / 当前用户。
 *
 * P0 安全加固：
 *  - 密码复杂度：≥8 位且同时含字母与数字（防弱口令爆破字典）；
 *  - admin 授予：默认关闭「首用户自动 admin」，仅当显式配置邀请码（BSZ_ADMIN_INVITE_CODE）
 *    且注册时携带匹配 inviteCode 才授予 admin；生产环境该码必须强随机并保密；
 *  - 用户名格式：字母数字下划线（防注入/仿冒）。
 */
@Service
public class AuthAppService {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final TokenService tokens;
    private final String adminInviteCode;

    public AuthAppService(UserRepository users, PasswordEncoder encoder, TokenService tokens,
                          @Value("${BSZ_ADMIN_INVITE_CODE:}") String adminInviteCode) {
        this.users = users;
        this.encoder = encoder;
        this.tokens = tokens;
        this.adminInviteCode = adminInviteCode == null ? "" : adminInviteCode.trim();
    }

    /** 注册：普通用户；携带有效邀请码时授予 admin。 */
    @Transactional
    public Map<String, Object> register(String username, String password, String inviteCode) {
        if (username == null || !username.matches("[A-Za-z0-9_]{3,24}")) {
            throw DomainException.invalid("username must be 3-24 chars of letters/digits/underscore");
        }
        validatePasswordStrength(password);
        if (users.findByUsername(username).isPresent()) {
            throw DomainException.conflict("username taken");
        }
        // admin 授予：仅显式邀请码匹配（未配置邀请码 = 永不自动产生新 admin）
        boolean asAdmin = !adminInviteCode.isEmpty()
                && inviteCode != null && inviteCode.equals(adminInviteCode);
        User user = User.register(username, encoder.encode(password), asAdmin,
                Instant.now().toString());
        users.save(user);
        return response(user, tokens.sign(user.id(), user.role()));
    }

    /** 登录：校验通过后旧格式哈希自动升级；封禁用户拒绝登录。 */
    @Transactional
    public Map<String, Object> login(String username, String password) {
        User user = users.findByUsername(username == null ? "" : username)
                .orElseThrow(() -> DomainException.unauthorized("invalid credentials"));
        if (user.isBanned()) {
            throw DomainException.forbidden("account banned");
        }
        String raw = password == null ? "" : password;
        if (!encoder.matches(raw, user.passwordHash())) {
            throw DomainException.unauthorized("invalid credentials");
        }
        if (encoder.needsUpgrade(user.passwordHash())) {
            user.upgradePassword(encoder.encode(raw));
            users.save(user);
        }
        return response(user, tokens.sign(user.id(), user.role()));
    }

    /** 当前用户（鉴权后调用）。 */
    public Map<String, Object> me(UserActor actor) {
        User user = users.findById(actor.userId())
                .orElseThrow(() -> DomainException.unauthorized("invalid credentials"));
        return Map.of("user", userView(user));
    }

    /** 密码复杂度：≥8 位且同时包含字母与数字。 */
    private static void validatePasswordStrength(String password) {
        if (password == null || password.length() < 8
                || !password.matches(".*[A-Za-z].*") || !password.matches(".*[0-9].*")) {
            throw DomainException.invalid("password must be >= 8 chars with letters and digits");
        }
    }

    public static Map<String, Object> userView(User user) {
        return Map.of("id", user.id(), "username", user.username(), "role", user.role().name().toLowerCase());
    }

    private Map<String, Object> response(User user, String token) {
        return Map.of("token", token, "user", userView(user));
    }

    /** 鉴权后的用户上下文（interfaces 层从 JWT 构造）。 */
    public record UserActor(String userId, User.Role role, String username) {
        public boolean isAdmin() { return role == User.Role.ADMIN; }
    }
}
