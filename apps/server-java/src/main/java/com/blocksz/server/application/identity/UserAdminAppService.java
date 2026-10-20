package com.blocksz.server.application.identity;

import com.blocksz.server.domain.identity.User;
import com.blocksz.server.domain.identity.UserRepository;
import com.blocksz.server.domain.shared.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Identity 用例：用户管理（admin）——列表/搜索、角色变更、封禁/解封。 */
@Service
public class UserAdminAppService {

    private final UserRepository users;

    public UserAdminAppService(UserRepository users) {
        this.users = users;
    }

    /** 用户列表：keyword 模糊匹配用户名，limit/offset 分页，附带总数。 */
    public Map<String, Object> list(String keyword, int limit, int offset) {
        int lim = Math.max(1, Math.min(200, limit));
        int off = Math.max(0, offset);
        List<User> rows = users.search(keyword, lim, off);
        List<Map<String, Object>> items = new ArrayList<>();
        for (User u : rows) {
            items.add(adminView(u));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("users", items);
        out.put("total", users.count());
        out.put("limit", lim);
        out.put("offset", off);
        return out;
    }

    /** 变更角色（admin/player）。禁止操作自己（防止唯一 admin 自降）。 */
    @Transactional
    public Map<String, Object> changeRole(AuthAppService.UserActor actor, String userId, String role) {
        requireNotSelf(actor, userId);
        User u = find(userId);
        User.Role r = "admin".equalsIgnoreCase(role) ? User.Role.ADMIN
                : "player".equalsIgnoreCase(role) ? User.Role.PLAYER : null;
        if (r == null) throw DomainException.invalid("role must be admin|player");
        u.changeRole(r);
        users.save(u);
        return Map.of("user", adminView(u));
    }

    /** 封禁/解封。禁止操作自己。 */
    @Transactional
    public Map<String, Object> setBanned(AuthAppService.UserActor actor, String userId, boolean banned) {
        requireNotSelf(actor, userId);
        User u = find(userId);
        u.setBanned(banned);
        users.save(u);
        return Map.of("user", adminView(u));
    }

    private User find(String userId) {
        return users.findById(userId)
                .orElseThrow(() -> DomainException.notFound("user not found"));
    }

    private static void requireNotSelf(AuthAppService.UserActor actor, String userId) {
        if (actor.userId().equals(userId)) {
            throw DomainException.invalid("cannot operate on yourself");
        }
    }

    /** admin 视图：不含密码哈希。 */
    public static Map<String, Object> adminView(User user) {
        return Map.of(
                "id", user.id(),
                "username", user.username(),
                "role", user.role().name().toLowerCase(),
                "banned", user.isBanned(),
                "createdAt", user.createdAt());
    }
}
