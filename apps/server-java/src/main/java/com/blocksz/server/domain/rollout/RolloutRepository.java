package com.blocksz.server.domain.rollout;

import java.util.Optional;

/** Rollout 上下文仓库接口。 */
public interface RolloutRepository {
    void save(RolloutConfig config);
    /** 无配置时返回空（调用方默认全量最新）。 */
    Optional<RolloutConfig> findBySceneId(String sceneId);
}
