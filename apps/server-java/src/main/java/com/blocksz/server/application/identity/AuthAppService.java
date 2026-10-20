package com.blocksz.server.application.identity;

import com.blocksz.server.domain.identity.PasswordEncoder;
import com.blocksz.server.domain.identity.TokenService;
import com.blocksz.server.domain.identity.User;
import com.blocksz.server.domain.identity.UserRepository;
import com.blocksz.server.domain.shared.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

/** Identity 用例：注册 / 登录 / 当前用户。 */
@Service
public class AuthAppService {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final TokenService tokens;

    public AuthAppService(UserRepository users, PasswordEncoder encoder, TokenService tokens) {
        this.users = users;
        this.encoder = encoder;
        this.tokens = tokens;
    }

    /** 注册：首个用户自动 admin；返回 token + 用户视图。 */
    @Transactional
    public Map<String, Object> register(String username, String password) {
        if (password == null || password.length() < 6) {
            throw DomainException.invalid("password must be >= 6 chars");
        }
        if (users.findByUsername(username).isPresent()) {
            throw DomainException.conflict("username taken");
        }
        User user = User.register(username, encoder.encode(password), !users.existsAny(),
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
