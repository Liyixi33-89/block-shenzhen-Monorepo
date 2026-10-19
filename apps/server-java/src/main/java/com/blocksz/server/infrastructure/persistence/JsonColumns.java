package com.blocksz.server.infrastructure.persistence;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

/** JSON 列编解码工具（payload 一律 Map<String,Object> 存取）。 */
public final class JsonColumns {
    private static final ObjectMapper M = new ObjectMapper();
    private static final TypeReference<LinkedHashMap<String, Object>> MAP = new TypeReference<>() {};

    private JsonColumns() {}

    public static String write(Object o) {
        try {
            return M.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalStateException("json encode failed", e);
        }
    }

    public static LinkedHashMap<String, Object> readMap(String json) {
        try {
            return json == null ? new LinkedHashMap<>() : M.readValue(json, MAP);
        } catch (Exception e) {
            throw new IllegalStateException("json decode failed", e);
        }
    }
}
