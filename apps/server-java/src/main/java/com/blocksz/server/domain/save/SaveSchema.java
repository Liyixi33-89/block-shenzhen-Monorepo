package com.blocksz.server.domain.save;

import java.util.List;
import java.util.Map;

/** 存档 Schema 校验端口（infrastructure 实现，规则对齐 zod playerSaveSchema）。 */
public interface SaveSchema {
    /** 校验通过返回规范化 payload；失败返回错误列表（path: message）。 */
    Result validate(Map<String, Object> payload);

    record Result(boolean ok, Map<String, Object> data, List<String> errors) {
        public static Result fail(List<String> errors) { return new Result(false, null, errors); }
        public static Result pass(Map<String, Object> data) { return new Result(true, data, List.of()); }
    }
}
