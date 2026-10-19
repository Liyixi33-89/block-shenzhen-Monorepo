package com.blocksz.server.application.content;

import com.blocksz.server.domain.content.SceneAggregate;
import com.blocksz.server.domain.content.SceneRepository;
import com.blocksz.server.domain.content.SceneSchema;
import com.blocksz.server.domain.rollout.RolloutConfig;
import com.blocksz.server.domain.rollout.RolloutRepository;
import com.blocksz.server.domain.save.SaveSchema;
import com.blocksz.server.domain.shared.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Content + Rollout 用例：场景拉取 / 草稿 / 发布 / 版本 / 灰度 / diff。 */
@Service
public class ContentAppService {

    private final SceneRepository scenes;
    private final SceneSchema schema;
    private final RolloutRepository rollouts;

    public ContentAppService(SceneRepository scenes, SceneSchema schema, RolloutRepository rollouts) {
        this.scenes = scenes;
        this.schema = schema;
        this.rollouts = rollouts;
    }

    /** 拉取场景：playerId 存在时走灰度分桶，否则最新版。 */
    public Map<String, Object> fetchScene(String sceneId, String playerId) {
        SceneAggregate agg = load(sceneId);
        if (!playerId.isEmpty()) {
            RolloutConfig cfg = rollouts.findBySceneId(sceneId).orElse(null);
            RolloutConfig.Resolved resolved = (cfg == null)
                    ? defaultResolve(agg)
                    : cfg.resolveFor(playerId, agg);
            if (resolved.scene() == null) throw DomainException.notFound("scene not found");
            return Map.of("scene", resolved.scene().payload(),
                    "version", resolved.version(), "gray", resolved.gray());
        }
        var latest = agg.latest().orElseThrow(() -> DomainException.notFound("scene not found"));
        return Map.of("scene", latest.payload(), "version", latest.version());
    }

    private RolloutConfig.Resolved defaultResolve(SceneAggregate agg) {
        var latest = agg.latest();
        return new RolloutConfig.Resolved(
                latest.orElse(null), latest.map(SceneAggregate.PublishedVersion::version).orElse(""), false);
    }

    /** 版本列表。 */
    public Map<String, Object> versions(String sceneId) {
        return Map.of("versions", load(sceneId).versionList());
    }

    /** 指定版本（不可变）。 */
    public Map<String, Object> version(String sceneId, String version) {
        var v = load(sceneId).byVersion(version)
                .orElseThrow(() -> DomainException.notFound("version not found"));
        return Map.of("scene", v.payload());
    }

    /** 保存草稿（Schema 校验拒绝脏数据）。 */
    @Transactional
    public Map<String, Object> saveDraft(String sceneId, Map<String, Object> payload) {
        SaveSchema.Result check = schema.validateScene(payload);
        if (!check.ok()) throw new SceneValidationException(check.errors());
        if (!sceneId.equals(check.data().get("id"))) {
            throw DomainException.invalid("scene id mismatch");
        }
        scenes.saveDraft(sceneId, check.data(), (String) check.data().get("version"));
        return Map.of("ok", true, "savedAt", java.time.Instant.now().toString());
    }

    /** 发布草稿（semver 递增规则在聚合内）。 */
    @Transactional
    public Map<String, Object> publish(String sceneId) {
        SceneAggregate agg = load(sceneId);
        var published = agg.publishWithCopy();
        scenes.addPublished(sceneId, published.version(), published.payload());
        return Map.of("ok", true, "published", published.version());
    }

    // ---- rollout ----

    public Map<String, Object> rollout(String sceneId) {
        SceneAggregate agg = load(sceneId);
        RolloutConfig cfg = rollouts.findBySceneId(sceneId)
                .orElse(new RolloutConfig(sceneId, "", 100));
        return Map.of(
                "rollout", Map.of("pinnedVersion", cfg.pinnedVersion(), "grayPercent", cfg.grayPercent()),
                "latest", agg.latest().map(SceneAggregate.PublishedVersion::version).orElse(""),
                "versions", agg.versionList());
    }

    @Transactional
    public Map<String, Object> setGray(String sceneId, int percent) {
        RolloutConfig cfg = rollouts.findBySceneId(sceneId)
                .orElse(new RolloutConfig(sceneId, "", 100));
        cfg.setGray(percent);
        rollouts.save(cfg);
        return Map.of("ok", true, "grayPercent", percent);
    }

    @Transactional
    public Map<String, Object> pin(String sceneId, String version) {
        SceneAggregate agg = load(sceneId);
        RolloutConfig cfg = rollouts.findBySceneId(sceneId)
                .orElse(new RolloutConfig(sceneId, "", 100));
        cfg.pin(version, agg);
        rollouts.save(cfg);
        return Map.of("ok", true, "pinnedVersion", version);
    }

    /** 版本 diff（深度对比）。 */
    public Map<String, Object> diff(String sceneId, String from, String to) {
        SceneAggregate agg = load(sceneId);
        var a = agg.byVersion(from).orElseThrow(() -> DomainException.notFound("version not found"));
        var b = agg.byVersion(to).orElseThrow(() -> DomainException.notFound("version not found"));
        return Map.of("diff", SceneDiff.diff(a.payload(), b.payload()));
    }

    private SceneAggregate load(String sceneId) {
        return scenes.load(sceneId).orElseThrow(() -> DomainException.notFound("scene not found"));
    }

    /** 场景校验失败（422 + issues）。 */
    public static class SceneValidationException extends RuntimeException {
        private final List<String> issues;
        public SceneValidationException(List<String> issues) {
            super("invalid scene");
            this.issues = issues;
        }
        public List<String> issues() { return issues; }
    }

    /** 深度 diff 领域服务（对齐 Node 版 diffScene：深度限制 4、变化截断 20）。 */
    static final class SceneDiff {
        static List<Map<String, String>> diff(Object a, Object b) {
            List<Map<String, String>> out = new ArrayList<>();
            walk(a, b, new ArrayList<>(), out, 0);
            return out;
        }

        @SuppressWarnings("unchecked")
        private static void walk(Object a, Object b, List<String> path,
                                 List<Map<String, String>> out, int depth) {
            if (depth > 4) return;
            if (java.util.Objects.equals(a, b)) return;
            String ta = typeOf(a), tb = typeOf(b);
            if (!ta.equals(tb)) {
                out.add(Map.of("path", String.join(".", path), "type", "type-change", "detail", ta + " → " + tb));
                return;
            }
            switch (ta) {
                case "array" -> {
                    List<Object> la = (List<Object>) a, lb = (List<Object>) b;
                    if (la.size() != lb.size()) {
                        out.add(Map.of("path", String.join(".", path) + ".length", "type", "size",
                                "detail", la.size() + " → " + lb.size()));
                    }
                    int n = Math.min(la.size(), lb.size());
                    int changed = 0;
                    for (int i = 0; i < n; i++) {
                        int before = out.size();
                        List<String> sub = new ArrayList<>(path);
                        sub.add(String.valueOf(i));
                        walk(la.get(i), lb.get(i), sub, out, depth + 1);
                        if (out.size() > before && ++changed > 20) {
                            out.add(Map.of("path", String.join(".", path), "type", "truncated",
                                    "detail", "…共 " + n + " 项，仅显示前 20 处变化"));
                            return;
                        }
                    }
                }
                case "object" -> {
                    Map<String, Object> ma = (Map<String, Object>) a, mb = (Map<String, Object>) b;
                    java.util.Set<String> keys = new java.util.LinkedHashSet<>(ma.keySet());
                    keys.addAll(mb.keySet());
                    for (String k : keys) {
                        List<String> sub = new ArrayList<>(path);
                        sub.add(k);
                        walk(ma.get(k), mb.get(k), sub, out, depth + 1);
                    }
                }
                default -> out.add(Map.of(
                        "path", path.isEmpty() ? "(root)" : String.join(".", path),
                        "type", "value",
                        "detail", trunc(json(a)) + " → " + trunc(json(b))));
            }
        }

        private static String typeOf(Object o) {
            if (o instanceof List) return "array";
            if (o instanceof Map) return "object";
            return o == null ? "undefined" : o.getClass().getSimpleName().toLowerCase();
        }

        private static String json(Object o) {
            try {
                return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(o);
            } catch (Exception e) {
                return String.valueOf(o);
            }
        }

        private static String trunc(String s) { return s.length() <= 80 ? s : s.substring(0, 80); }
    }
}
