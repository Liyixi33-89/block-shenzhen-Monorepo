package com.blocksz.server.domain.content;

import com.blocksz.server.domain.shared.DomainException;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Content 上下文聚合根：场景（草稿 + 已发布版本序列）。
 * 不变量：
 *  - 已发布版本不可变、按 semver 严格递增追加；
 *  - draft 单份可覆盖；
 *  - 当前线上版本 = 已发布序列最后一个（未配置回滚时）。
 */
public class SceneAggregate {
    private final String sceneId;
    private Map<String, Object> draft;          // 可为 null（无草稿）
    private String draftVersion = "";
    private final List<PublishedVersion> published = new ArrayList<>();

    /** 已发布版本（不可变快照）。 */
    public record PublishedVersion(String version, Map<String, Object> payload) {}

    public SceneAggregate(String sceneId) {
        this.sceneId = sceneId;
    }

    public static SceneAggregate rehydrate(String sceneId, Map<String, Object> draft,
                                           List<PublishedVersion> published) {
        SceneAggregate agg = new SceneAggregate(sceneId);
        if (draft != null) {
            agg.draft = draft;
            agg.draftVersion = str(draft.get("version"));
        }
        agg.published.addAll(published);
        return agg;
    }

    /** 保存草稿（payload 已通过 Schema 校验且 id 与聚合一致）。 */
    public void saveDraft(Map<String, Object> payload) {
        String id = str(payload.get("id"));
        if (!sceneId.equals(id)) throw DomainException.invalid("scene id mismatch");
        this.draft = payload;
        this.draftVersion = str(payload.get("version"));
    }

    /** 发布：草稿版本必须严格大于最新已发布版本（semver 逐段比较）。 */
    public PublishedVersion publish() {
        if (draft == null) throw DomainException.notFound("no draft");
        if (!published.isEmpty() && semverCompare(draftVersion, latestVersion()) <= 0) {
            throw DomainException.conflict("version must be greater than " + latestVersion());
        }
        PublishedVersion v = new PublishedVersion(draftVersion, draft);
        published.add(v);
        return v;
    }

    /** 深拷贝快照语义：发布记录持有当时草稿副本。 */
    public PublishedVersion publishWithCopy() {
        if (draft == null) throw DomainException.notFound("no draft");
        if (!published.isEmpty() && semverCompare(draftVersion, latestVersion()) <= 0) {
            throw DomainException.conflict("version must be greater than " + latestVersion());
        }
        PublishedVersion v = new PublishedVersion(draftVersion, new java.util.LinkedHashMap<>(draft));
        published.add(v);
        return v;
    }

    /** 最新已发布版本号（无发布返回空串）。 */
    public String latestVersion() {
        return published.isEmpty() ? "" : published.get(published.size() - 1).version();
    }

    public Optional<PublishedVersion> latest() {
        return published.isEmpty() ? Optional.empty() : Optional.of(published.get(published.size() - 1));
    }

    public Optional<PublishedVersion> previous() {
        return published.size() >= 2 ? Optional.of(published.get(published.size() - 2)) : Optional.empty();
    }

    public Optional<PublishedVersion> byVersion(String version) {
        return published.stream().filter(v -> v.version().equals(version)).findFirst();
    }

    public List<String> versionList() {
        return published.stream().map(PublishedVersion::version).toList();
    }

    /** semver 逐段比较：a>b 返回正数。 */
    public static int semverCompare(String a, String b) {
        int[] pa = parseSemver(a), pb = parseSemver(b);
        for (int i = 0; i < 3; i++) {
            if (pa[i] != pb[i]) return Integer.compare(pa[i], pb[i]);
        }
        return 0;
    }

    private static int[] parseSemver(String s) {
        String[] parts = s.split("\\.");
        return new int[]{
                parts.length > 0 ? Integer.parseInt(parts[0]) : 0,
                parts.length > 1 ? Integer.parseInt(parts[1]) : 0,
                parts.length > 2 ? Integer.parseInt(parts[2]) : 0};
    }

    private static String str(Object o) { return o instanceof String s ? s : String.valueOf(o); }

    public String sceneId() { return sceneId; }
    public Map<String, Object> draft() { return draft; }
    public String draftVersion() { return draftVersion; }
    public List<PublishedVersion> published() { return List.copyOf(published); }
}
