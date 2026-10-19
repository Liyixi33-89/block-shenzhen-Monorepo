package com.blocksz.server.interfaces.rest;

import com.blocksz.server.application.creation.CreationAppService;
import com.blocksz.server.application.identity.AuthAppService.UserActor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 作品广场接口：发布 / 列表 / 点赞 / 详情。 */
@RestController
@RequestMapping("/api/creations")
public class CreationController {

    private final CreationAppService creations;

    public CreationController(CreationAppService creations) {
        this.creations = creations;
    }

    @PostMapping("/publish")
    public Map<String, Object> publish(@Auth UserActor actor, @RequestBody Map<String, Object> body) {
        return creations.publish(actor.userId(), actorUsername(actor), body);
    }

    @GetMapping("/list")
    public Map<String, Object> list(@RequestParam(required = false, defaultValue = "new") String sort) {
        return creations.list(sort, 30);
    }

    @PostMapping("/{id}/like")
    public Map<String, Object> like(@Auth UserActor actor, @PathVariable String id) {
        return creations.like(id, actor.userId());
    }

    @GetMapping("/{id}")
    public Map<String, Object> detail(@PathVariable String id) {
        return creations.detail(id);
    }

    /** UserActor 目前只带 userId/role；作品署名需要 username —— 从请求头扩展位取（应用层兜底「游客」）。 */
    private static String actorUsername(UserActor actor) {
        return actor == null ? "游客" : actor.username();
    }
}
