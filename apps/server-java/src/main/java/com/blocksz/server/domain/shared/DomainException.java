package com.blocksz.server.domain.shared;

/** 领域异常基类：业务规则违反（422/409/403 等 HTTP 语义由 interfaces 层翻译）。 */
public class DomainException extends RuntimeException {
    private final int status;

    public DomainException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int status() {
        return status;
    }

    // ---- 常用语义工厂 ----

    public static DomainException invalid(String message) { return new DomainException(422, message); }
    public static DomainException conflict(String message) { return new DomainException(409, message); }
    public static DomainException forbidden(String message) { return new DomainException(403, message); }
    public static DomainException notFound(String message) { return new DomainException(404, message); }
    public static DomainException unauthorized(String message) { return new DomainException(401, message); }
}
