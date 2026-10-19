package com.blocksz.server.interfaces.rest;

import com.blocksz.server.application.content.ContentAppService;
import com.blocksz.server.application.identity.AuthAppService.UserActor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 内容接口：场景拉取 / 版本 / 草稿 / 发布 / 灰度 / diff。 */
@RestController
@RequestMapping("/api/content")
public class ContentController {

    private final ContentAppService content;

    public ContentController(ContentAppService content) {
        this.content = content;
    }

    @GetMapping("/scenes/{id}")
    public Map<String, Object> scene(@PathVariable String id,
                                     @RequestParam(required = false, defaultValue = "") String playerId) {
        return content.fetchScene(id, playerId);
    }

    @GetMapping("/scenes/{id}/versions")
    public Map<String, Object> versions(@PathVariable String id) {
        return content.versions(id);
    }

    @GetMapping("/scenes/{id}/versions/{ver}")
    public Map<String, Object> version(@PathVariable String id, @PathVariable String ver) {
        return content.version(id, ver);
    }

    // ---- admin ----

    @PutMapping("/admin/scenes/{id}")
    public Map<String, Object> saveDraft(@PathVariable String id,
                                         @Auth UserActor actor,
                                         @RequestBody Map<String, Object> body) {
        AdminGuard.require(actor);
        return content.saveDraft(id, body);
    }

    @PostMapping("/admin/scenes/{id}/publish")
    public Map<String, Object> publish(@PathVariable String id, @Auth UserActor actor) {
        AdminGuard.require(actor);
        return content.publish(id);
    }

    @GetMapping("/admin/scenes/{id}/rollout")
    public Map<String, Object> rollout(@PathVariable String id, @Auth UserActor actor) {
        AdminGuard.require(actor);
        return content.rollout(id);
    }

    @PostMapping("/admin/scenes/{id}/rollout/gray")
    public Map<String, Object> gray(@PathVariable String id, @Auth UserActor actor,
                                    @RequestBody Map<String, Object> body) {
        AdminGuard.require(actor);
        Object raw = body.get("percent");
        if (!(raw instanceof Number n) || n.doubleValue() != n.intValue()) {
            throw com.blocksz.server.domain.shared.DomainException.invalid("percent must be 0-100");
        }
        return content.setGray(id, n.intValue());
    }

    @PostMapping("/admin/scenes/{id}/rollout/pin")
    public Map<String, Object> pin(@PathVariable String id, @Auth UserActor actor,
                                   @RequestBody Map<String, Object> body) {
        AdminGuard.require(actor);
        String ver = body.get("version") instanceof String s ? s : "";
        return content.pin(id, ver);
    }

    @GetMapping("/admin/scenes/{id}/diff")
    public Map<String, Object> diff(@PathVariable String id, @Auth UserActor actor,
                                    @RequestParam String from, @RequestParam String to) {
        AdminGuard.require(actor);
        return content.diff(id, from, to);
    }
}
