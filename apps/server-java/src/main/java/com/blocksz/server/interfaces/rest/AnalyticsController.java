package com.blocksz.server.interfaces.rest;

import com.blocksz.server.application.analytics.AnalyticsAppService;
import com.blocksz.server.application.identity.AuthAppService.UserActor;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** 埋点接口：批量上报 + admin 聚合查询。 */
@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsAppService analytics;

    public AnalyticsController(AnalyticsAppService analytics) {
        this.analytics = analytics;
    }

    @PostMapping("/collect")
    public Map<String, Object> collect(@Auth UserActor actor, @RequestBody Map<String, Object> body) {
        Object events = body.get("events");
        List<Map<String, Object>> list = new ArrayList<>();
        if (events instanceof List<?> l) {
            for (Object o : l) {
                if (o instanceof Map<?, ?> m) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> e = (Map<String, Object>) m;
                    list.add(e);
                }
            }
        }
        return analytics.collect(actor.userId(), list);
    }

    // ---- admin ----

    @GetMapping("/admin/overview")
    public Map<String, Object> overview(@Auth UserActor actor,
                                        @RequestParam(required = false, defaultValue = "7") int days) {
        AdminGuard.require(actor);
        return analytics.overview(days);
    }

    @GetMapping("/admin/funnel")
    public Map<String, Object> funnel(@Auth UserActor actor,
                                      @RequestParam String steps,
                                      @RequestParam(required = false, defaultValue = "14") int days) {
        AdminGuard.require(actor);
        List<String> stepList = new ArrayList<>();
        for (String s : steps.split(",")) {
            if (!s.isBlank()) stepList.add(s.strip());
        }
        return analytics.funnel(stepList, days);
    }

    @GetMapping("/admin/dau")
    public Map<String, Object> dau(@Auth UserActor actor,
                                   @RequestParam(required = false, defaultValue = "14") int days) {
        AdminGuard.require(actor);
        return analytics.dau(days);
    }
}
