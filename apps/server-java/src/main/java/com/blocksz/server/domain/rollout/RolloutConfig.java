package com.blocksz.server.domain.rollout;

import com.blocksz.server.domain.content.SceneAggregate;
import com.blocksz.server.domain.shared.DomainException;

import java.util.Optional;

/**
 * Rollout 上下文：灰度发布配置（每个 sceneId 一份）。
 * 策略：
 *  - 未配置 → 全量最新版；
 *  - pinnedVersion 非空 → 全量锁定该版本（回滚）；
 *  - grayPercent ∈ [0,100)：playerId 稳定哈希分桶，桶值 < grayPercent 走最新版（gray=true），其余走上一版；
 *  - grayPercent = 100 → 全量最新版。
 */
public class RolloutConfig {
    private final String sceneId;
    private String pinnedVersion;
    private int grayPercent = 100;

    public RolloutConfig(String sceneId, String pinnedVersion, int grayPercent) {
        this.sceneId = sceneId;
        this.pinnedVersion = pinnedVersion == null ? "" : pinnedVersion;
        this.grayPercent = grayPercent;
    }

    /** 设置灰度百分比（0-100）。 */
    public void setGray(int percent) {
        if (percent < 0 || percent > 100) throw DomainException.invalid("percent must be 0-100");
        this.grayPercent = percent;
        this.pinnedVersion = "";
    }

    /** 锁定/解锁版本（'' = 取消锁定恢复灰度策略）。 */
    public void pin(String version, SceneAggregate scene) {
        if (!version.isEmpty() && scene.byVersion(version).isEmpty()) {
            throw DomainException.notFound("version not found");
        }
        this.pinnedVersion = version;
        this.grayPercent = 100;
    }

    /** 解析 playerId 命中的版本。 */
    public Resolved resolveFor(String playerId, SceneAggregate scene) {
        var latest = scene.latest();
        if (latest.isEmpty()) return new Resolved(null, "", false);
        if (!pinnedVersion.isEmpty()) {
            var pinned = scene.byVersion(pinnedVersion);
            return new Resolved(pinned.orElse(null), pinnedVersion, false);
        }
        if (grayPercent >= 100) return new Resolved(latest.get(), latest.get().version(), false);
        int bucket = stableBucket(playerId);
        if (bucket < grayPercent) return new Resolved(latest.get(), latest.get().version(), true);
        var prev = scene.previous();
        return new Resolved(prev.orElse(latest.get()), prev.map(SceneAggregate.PublishedVersion::version).orElse(latest.get().version()), false);
    }

    /** 稳定哈希分桶：同 playerId 永远同桶（与 Node 版 hashBucket 兼容：h*31+c 32 位循环）。 */
    static int stableBucket(String id) {
        long h = 0;
        for (int i = 0; i < id.length(); i++) {
            h = (h * 31 + id.charAt(i)) & 0xFFFFFFFFL;
        }
        return (int) (h % 100);
    }

    public record Resolved(SceneAggregate.PublishedVersion scene, String version, boolean gray) {}

    public String sceneId() { return sceneId; }
    public String pinnedVersion() { return pinnedVersion; }
    public int grayPercent() { return grayPercent; }
}
