package com.blocksz.server.domain.creation;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Creation 上下文仓库接口。 */
public interface CreationRepository {
    void save(Creation creation);
    /** 点赞变更持久化（likes + likers）。 */
    void saveLike(Creation creation);
    Optional<Creation> findById(String id);
    /** 列表：sort = new（按时间倒序）/ hot（按点赞倒序）。 */
    List<Creation> list(String sort, int limit);

    /** placements 结构校验（应用层调用；1-500 项、坐标边界内）。 */
    static List<Map<String, Object>> parsePlacements(Object raw) {
        if (!(raw instanceof List<?> list) || list.isEmpty() || list.size() > 500) return null;
        List<Map<String, Object>> out = new java.util.ArrayList<>();
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> p)) return null;
            Object element = p.get("element");
            if (!(element instanceof String el) || el.length() > 64) return null;
            double x = num(p.get("x")), y = num(p.get("y")), z = num(p.get("z"));
            if (!finite(x, y, z)) return null;
            if (Math.abs(x) > 5000 || Math.abs(y) > 2000 || Math.abs(z) > 5000) return null;
            double rot = num(p.get("rot"), 0);
            double n = num(p.get("n"), 1);
            if (!Double.isFinite(rot) || !Double.isFinite(n)) return null;
            Map<String, Object> item = new java.util.LinkedHashMap<>();
            item.put("n", (int) n);
            item.put("element", el);
            item.put("x", x);
            item.put("y", y);
            item.put("z", z);
            item.put("rot", rot);
            out.add(item);
        }
        return out;
    }

    private static double num(Object o) {
        return o instanceof Number n ? n.doubleValue() : Double.NaN;
    }

    /** 缺省数值：null/非数值返回 def。 */
    private static double num(Object o, double def) {
        double v = num(o);
        return Double.isFinite(v) ? v : def;
    }

    private static boolean finite(double... vs) {
        for (double v : vs) if (!Double.isFinite(v)) return false;
        return true;
    }
}
