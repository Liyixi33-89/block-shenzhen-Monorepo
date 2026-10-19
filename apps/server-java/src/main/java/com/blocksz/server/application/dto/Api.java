package com.blocksz.server.application.dto;

import java.util.Map;

/** 通用 API 响应封装（对齐 Node 版错误格式 { error } 与业务数据）。 */
public final class Api {
    private Api() {}

    public static Map<String, Object> ok() { return Map.of("ok", true); }

    public static Map<String, Object> error(String message) { return Map.of("error", message); }

    public static Map<String, Object> of(Object... kv) {
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }
}
