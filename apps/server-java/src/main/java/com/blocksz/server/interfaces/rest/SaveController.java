package com.blocksz.server.interfaces.rest;

import com.blocksz.server.application.identity.AuthAppService.UserActor;
import com.blocksz.server.application.save.SaveAppService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 云存档接口（需登录）。 */
@RestController
@RequestMapping("/api/save")
public class SaveController {

    private final SaveAppService saves;

    public SaveController(SaveAppService saves) {
        this.saves = saves;
    }

    @GetMapping
    public Map<String, Object> download(@Auth UserActor actor) {
        return saves.download(actor.userId());
    }

    @PutMapping
    public Map<String, Object> upload(@Auth UserActor actor, @RequestBody Map<String, Object> body) {
        return saves.upload(actor.userId(), body);
    }

    @DeleteMapping
    public Map<String, Object> delete(@Auth UserActor actor) {
        return saves.delete(actor.userId());
    }
}
