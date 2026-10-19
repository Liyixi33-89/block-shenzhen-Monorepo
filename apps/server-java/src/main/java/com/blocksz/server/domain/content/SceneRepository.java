package com.blocksz.server.domain.content;

import java.util.Map;
import java.util.Optional;

/** Content 上下文仓库接口。 */
public interface SceneRepository {
    /** 写入/覆盖草稿。 */
    void saveDraft(String sceneId, Map<String, Object> payload, String version);
    /** 追加发布版本（不可变）。 */
    void addPublished(String sceneId, String version, Map<String, Object> payload);
    /** 读取整个聚合（draft + 全部发布版本，按时间序）。 */
    Optional<SceneAggregate> load(String sceneId);
}
