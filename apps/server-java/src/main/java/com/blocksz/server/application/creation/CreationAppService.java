package com.blocksz.server.application.creation;

import com.blocksz.server.domain.creation.Creation;
import com.blocksz.server.domain.creation.CreationRepository;
import com.blocksz.server.domain.shared.DomainException;
import com.blocksz.server.infrastructure.security.ContentFilter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Creation 用例：发布 / 列表 / 点赞 / 详情导入（P0：UGC 敏感词过滤）。 */
@Service
public class CreationAppService {

    private final CreationRepository creations;
    private final ContentFilter contentFilter;

    public CreationAppService(CreationRepository creations, ContentFilter contentFilter) {
        this.creations = creations;
        this.contentFilter = contentFilter;
    }

    /** 发布作品（游客身份即可；标题/描述过敏感词）。 */
    @Transactional
    public Map<String, Object> publish(String playerId, String playerName, Map<String, Object> body) {
        Object title = body.get("title");
        Object desc = body.get("desc");
        List<Map<String, Object>> placements = CreationRepository.parsePlacements(body.get("placements"));
        if (placements == null) {
            throw DomainException.invalid("placements invalid (1-500 items)");
        }
        if (!(title instanceof String t)) {
            throw DomainException.invalid("title must be 2-32 chars");
        }
        // P0 内容安全：标题/描述敏感词拦截（命中即拒，返回 400）
        if (contentFilter.reject(t) || contentFilter.reject(desc instanceof String d ? d : "")) {
            throw DomainException.invalid("content contains sensitive words");
        }
        Creation c = Creation.publish(playerId, playerName, t,
                desc instanceof String d ? d : "", placements);
        creations.save(c);
        return Map.of("ok", true, "id", c.id());
    }

    /** 列表：sort = new | hot。 */
    public Map<String, Object> list(String sort, int limit) {
        String s = "hot".equals(sort) ? "hot" : "new";
        List<Map<String, Object>> out = new ArrayList<>();
        for (Creation c : creations.list(s, limit)) {
            out.add(summary(c));
        }
        return Map.of("creations", out);
    }

    /** 点赞（同玩家同作品去重）。 */
    @Transactional
    public Map<String, Object> like(String id, String playerId) {
        Creation c = creations.findById(id)
                .orElseThrow(() -> DomainException.conflict("already liked or not found"));
        if (!c.like(playerId)) {
            throw DomainException.conflict("already liked or not found");
        }
        creations.saveLike(c);
        return Map.of("ok", true, "likes", c.likes());
    }

    /** 详情（导入用：返回完整 placements）。 */
    public Map<String, Object> detail(String id) {
        Creation c = creations.findById(id)
                .orElseThrow(() -> DomainException.notFound("creation not found"));
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", c.id());
        view.put("title", c.title());
        view.put("desc", c.desc());
        view.put("likes", c.likes());
        view.put("author", c.playerName());
        view.put("count", c.placements().size());
        view.put("placements", c.placements());
        return Map.of("creation", view);
    }

    private Map<String, Object> summary(Creation c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", c.id());
        m.put("title", c.title());
        m.put("desc", c.desc());
        m.put("likes", c.likes());
        m.put("author", c.playerName());
        m.put("createdAt", c.createdAt());
        m.put("count", c.placements().size());
        return m;
    }
}
