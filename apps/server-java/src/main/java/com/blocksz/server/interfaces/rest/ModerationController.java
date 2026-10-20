package com.blocksz.server.interfaces.rest;

import com.blocksz.server.application.identity.AuthAppService.UserActor;
import com.blocksz.server.application.moderation.ModerationAppService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * P0 内容审核接口：
 *  - POST /api/reports        玩家举报 UGC（作品/玩家）
 *  - GET  /api/admin/reports  admin 查看举报队列
 *  - POST /api/admin/reports/{id}/resolve  admin 处置举报
 */
@RestController
public class ModerationController {

    private final ModerationAppService moderation;

    public ModerationController(ModerationAppService moderation) {
        this.moderation = moderation;
    }

    @PostMapping("/api/reports")
    public Map<String, Object> report(@Auth UserActor actor, @RequestBody Map<String, Object> body) {
        String reporterId = actor == null ? "guest" : actor.userId();
        return moderation.report(
                reporterId,
                str(body.get("kind")),
                str(body.get("targetId")),
                str(body.get("reason")));
    }

    @GetMapping("/api/admin/reports")
    public Map<String, Object> queue(@Auth UserActor actor,
                                     @RequestParam(required = false, defaultValue = "open") String status) {
        AdminGuard.require(actor);
        return moderation.queue(status);
    }

    @PostMapping("/api/admin/reports/{id}/resolve")
    public Map<String, Object> resolve(@Auth UserActor actor, @PathVariable long id,
                                       @RequestBody Map<String, Object> body) {
        AdminGuard.require(actor);
        return moderation.resolve(id, str(body.get("action")));
    }

    private static String str(Object o) { return o instanceof String s ? s : ""; }
}
