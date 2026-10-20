package com.blocksz.server.interfaces.rest;

import com.blocksz.server.application.identity.AuthAppService.UserActor;
import com.blocksz.server.application.identity.UserAdminAppService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 用户管理接口（admin）：列表/搜索、角色变更、封禁/解封。 */
@RestController
@RequestMapping("/api/admin/users")
public class AdminUserController {

    private final UserAdminAppService admin;

    public AdminUserController(UserAdminAppService admin) {
        this.admin = admin;
    }

    /** 用户列表：?keyword=&limit=&offset= */
    @GetMapping
    public Map<String, Object> list(@Auth UserActor actor,
                                    @RequestParam(defaultValue = "") String keyword,
                                    @RequestParam(defaultValue = "50") int limit,
                                    @RequestParam(defaultValue = "0") int offset) {
        AdminGuard.require(actor);
        return admin.list(keyword, limit, offset);
    }

    /** 变更角色：body {"role": "admin"|"player"} */
    @PutMapping("/{id}/role")
    public Map<String, Object> changeRole(@PathVariable String id, @Auth UserActor actor,
                                          @RequestBody Map<String, Object> body) {
        AdminGuard.require(actor);
        Object role = body.get("role");
        return admin.changeRole(actor, id, role instanceof String s ? s : "");
    }

    /** 封禁/解封：body {"banned": true|false} */
    @PutMapping("/{id}/ban")
    public Map<String, Object> setBanned(@PathVariable String id, @Auth UserActor actor,
                                         @RequestBody Map<String, Object> body) {
        AdminGuard.require(actor);
        Object banned = body.get("banned");
        return admin.setBanned(actor, id, Boolean.TRUE.equals(banned));
    }
}
