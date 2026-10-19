package com.blocksz.server.domain.content;

import com.blocksz.server.domain.save.SaveSchema;

import java.util.Map;

/** Scene Schema 校验端口（规则对齐 zod sceneSchema）。 */
public interface SceneSchema {
    /** 校验 Scene payload；失败返回错误列表。 */
    SaveSchema.Result validateScene(Map<String, Object> payload);
}
