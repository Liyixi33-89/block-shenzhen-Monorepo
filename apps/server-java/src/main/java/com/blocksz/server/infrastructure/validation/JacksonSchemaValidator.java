package com.blocksz.server.infrastructure.validation;

import com.blocksz.server.domain.save.SaveSchema;
import com.blocksz.server.domain.content.SceneSchema;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Scene/PlayerSave 校验（规则对齐 packages/schema 的 zod 定义）。
 * 手写实现的取舍：避免引入 zod→JSON Schema 工具链，规则集中一处可审计。
 */
@Component
public class JacksonSchemaValidator implements SceneSchema, SaveSchema {

    /** SaveSchema#validate（PlayerSave 校验；validateScene 实现 SceneSchema）。 */
    @Override
    public Result validate(Map<String, Object> payload) {
        List<String> errors = new ArrayList<>();
        reqStr(payload.get("playerId"), "playerId", 1, Integer.MAX_VALUE, errors);
        if (!(payload.get("sceneId") instanceof String) && payload.get("sceneId") != null) errors.add("sceneId: expected string");
        reqStr(payload.get("name"), "name", 1, 16, errors);
        reqStr(payload.get("createdAt"), "createdAt", 1, Integer.MAX_VALUE, errors);
        reqStr(payload.get("updatedAt"), "updatedAt", 1, Integer.MAX_VALUE, errors);
        if (payload.get("money") instanceof Number n) {
            if (n.intValue() < 0 || n.doubleValue() != n.intValue()) errors.add("money: must be int >= 0");
        } else if (payload.get("money") == null) {
            // zod default(500)
        } else errors.add("money: expected number");
        Map<String, Object> pos = asMap(payload.get("pos"), "pos", errors);
        if (pos != null) {
            num(pos.get("x"), "pos.x", errors);
            num(pos.get("y"), "pos.y", errors);
            num(pos.get("z"), "pos.z", errors);
        } else if (payload.get("pos") == null) {
            errors.add("pos: required");
        }
        strList(payload.get("visited"), "visited", errors);
        strList(payload.get("photos"), "photos", errors);
        strList(payload.get("unlockedTeleports"), "unlockedTeleports", errors);
        strList(payload.get("cameraSkins"), "cameraSkins", errors);
        if (payload.get("cameraSkin") != null && !(payload.get("cameraSkin") instanceof String)) errors.add("cameraSkin: expected string");
        if (payload.get("facing") != null) num(payload.get("facing"), "facing", errors);
        if (payload.get("ascensionStage") != null && !(payload.get("ascensionStage") instanceof String)) errors.add("ascensionStage: expected string");
        intNum(payload.get("ascensionPoints"), "ascensionPoints", errors, true);
        list(payload.get("placements"), "placements", errors);
        if (payload.get("questProgress") != null && !(payload.get("questProgress") instanceof Map)) errors.add("questProgress: expected object");
        if (payload.get("inventory") != null && !(payload.get("inventory") instanceof Map)) errors.add("inventory: expected object");
        if (payload.get("shopBought") != null && !(payload.get("shopBought") instanceof Map)) errors.add("shopBought: expected object");
        if (payload.get("investments") != null && !(payload.get("investments") instanceof Map)) errors.add("investments: expected object");
        if (payload.get("activeEffects") != null && !(payload.get("activeEffects") instanceof Map)) errors.add("activeEffects: expected object");
        if (payload.get("investSettledAt") != null && !(payload.get("investSettledAt") instanceof String)) errors.add("investSettledAt: expected string");

        if (!errors.isEmpty()) return Result.fail(errors);
        // 补默认值（对齐 zod .default()）
        LinkedHashMap<String, Object> norm = new LinkedHashMap<>(payload);
        norm.putIfAbsent("sceneId", "shenzhen-main");
        norm.putIfAbsent("money", 500);
        norm.putIfAbsent("facing", 0);
        norm.putIfAbsent("visited", List.of());
        norm.putIfAbsent("photos", List.of());
        norm.putIfAbsent("questProgress", Map.of());
        norm.putIfAbsent("inventory", Map.of());
        norm.putIfAbsent("ascensionPoints", 0);
        norm.putIfAbsent("ascensionStage", "");
        norm.putIfAbsent("unlockedTeleports", List.of());
        norm.putIfAbsent("placements", List.of());
        norm.putIfAbsent("shopBought", Map.of());
        norm.putIfAbsent("cameraSkins", List.of());
        norm.putIfAbsent("cameraSkin", "");
        norm.putIfAbsent("investments", Map.of());
        norm.putIfAbsent("investSettledAt", "");
        norm.putIfAbsent("activeEffects", Map.of());
        return Result.pass(norm);
    }

    // ---- Scene 校验（sceneSchema，实现 SceneSchema#validate）----

    private static final Pattern SCENE_ID = Pattern.compile("^[a-z][a-z0-9_-]*$");
    private static final Pattern SEMVER = Pattern.compile("^\\d+\\.\\d+\\.\\d+$");

    /** SceneSchema#validate（Scene 校验）。 */
    @Override
    public Result validateScene(Map<String, Object> s) {
        List<String> errors = new ArrayList<>();
        str(s.get("id"), "id", errors);
        if (!SCENE_ID.matcher(str(s.get("id"), "")).matches()) errors.add("id: must match ^[a-z][a-z0-9_-]*$");
        reqStr(s.get("name"), "name", 1, Integer.MAX_VALUE, errors);
        if (!(s.get("desc") instanceof String) && s.get("desc") != null) errors.add("desc: expected string");
        if (!SEMVER.matcher(str(s.get("version"), "")).matches()) errors.add("version: must be semver x.y.z");
        // projection
        Map<String, Object> proj = asMap(s.get("projection"), "projection", errors);
        if (proj != null) {
            Map<String, Object> origin = asMap(proj.get("origin"), "projection.origin", errors);
            if (origin != null) {
                num(origin.get("lat"), "projection.origin.lat", errors);
                num(origin.get("lng"), "projection.origin.lng", errors);
            }
            if (proj.get("unitPerKm") != null) posNum(proj.get("unitPerKm"), "projection.unitPerKm", errors);
            if (proj.get("farCompress") != null) posNum(proj.get("farCompress"), "projection.farCompress", errors);
        } else {
            errors.add("projection: required");
        }
        // 数组结构
        list(s.get("districts"), "districts", errors);
        list(s.get("landmarks"), "landmarks", errors);
        list(s.get("elements"), "elements", errors);
        list(s.get("quests"), "quests", errors);
        list(s.get("npcs"), "npcs", errors);
        list(s.get("spawnPoints"), "spawnPoints", errors);
        if (list(s.get("spawnPoints"), "spawnPoints", errors)) {
            List<?> sp = (List<?>) s.get("spawnPoints");
            if (sp.isEmpty()) errors.add("spawnPoints: min 1 item");
        }
        list(s.get("teleportPoints"), "teleportPoints", errors);
        list(s.get("buildRecipes"), "buildRecipes", errors);
        list(s.get("shopItems"), "shopItems", errors);
        if (s.get("traffic") != null && !(s.get("traffic") instanceof Map)) errors.add("traffic: expected object");
        if (s.get("ascension") != null && !(s.get("ascension") instanceof Map)) errors.add("ascension: expected object");
        if (s.get("invest") != null && !(s.get("invest") instanceof Map)) errors.add("invest: expected object");

        if (!errors.isEmpty()) return Result.fail(errors);
        // 规范化：补 zod 默认值（desc/spawnPoints 之外客户端自行兼容，这里原样返回）
        return Result.pass(new LinkedHashMap<>(s));
    }

    // ---- 校验小工具 ----

    private static String str(Object o, String def) { return o instanceof String s ? s : def; }

    private static void str(Object o, String field, List<String> errors) {
        if (!(o instanceof String)) errors.add(field + ": expected string");
    }

    private static void reqStr(Object o, String field, int min, int max, List<String> errors) {
        if (o instanceof String s) {
            if (s.length() < min || s.length() > max) errors.add(field + ": length must be " + min + "-" + max);
        } else {
            errors.add(field + ": required string");
        }
    }

    private static void num(Object o, String field, List<String> errors) {
        if (!(o instanceof Number)) errors.add(field + ": expected number");
    }

    private static void posNum(Object o, String field, List<String> errors) {
        if (o instanceof Number n && n.doubleValue() <= 0) errors.add(field + ": must be positive");
        else if (!(o instanceof Number)) errors.add(field + ": expected number");
    }

    private static void intNum(Object o, String field, List<String> errors, boolean nonNeg) {
        if (o == null) return;
        if (o instanceof Number n) {
            if (n.doubleValue() != n.intValue()) errors.add(field + ": must be integer");
            else if (nonNeg && n.intValue() < 0) errors.add(field + ": must be >= 0");
        } else errors.add(field + ": expected number");
    }

    private static boolean list(Object o, String field, List<String> errors) {
        if (o instanceof List) return true;
        errors.add(field + ": expected array");
        return false;
    }

    private static void strList(Object o, String field, List<String> errors) {
        if (o == null) return;
        if (!(o instanceof List<?> l)) { errors.add(field + ": expected array"); return; }
        for (Object item : l) {
            if (!(item instanceof String)) { errors.add(field + ": expected string items"); return; }
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object o, String field, List<String> errors) {
        if (o == null) return null;
        if (o instanceof Map) return (Map<String, Object>) o;
        errors.add(field + ": expected object");
        return null;
    }
}
