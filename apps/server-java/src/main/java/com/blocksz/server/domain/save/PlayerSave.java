package com.blocksz.server.domain.save;

import com.blocksz.server.domain.shared.DomainException;

import java.util.Map;

/**
 * Save 上下文聚合根：玩家云存档。
 * payload 为客户端 PlayerSave JSON（键：playerId/money/pos/visited/photos/...），
 * 结构校验由 infrastructure 的 SaveSchema 端口在应用层调用（对齐 zod playerSaveSchema）。
 */
public class PlayerSave {
    private final String playerId;
    private Map<String, Object> payload;
    private String updatedAt;

    public PlayerSave(String playerId, Map<String, Object> payload, String updatedAt) {
        this.playerId = playerId;
        this.payload = payload;
        this.updatedAt = updatedAt;
    }

    /** 全量覆盖式更新；归属不可变（playerId 必须与聚合一致）。 */
    public void overwrite(Map<String, Object> newPayload, String now) {
        Object pid = newPayload.get("playerId");
        if (pid instanceof String s && !s.equals(playerId)) {
            throw DomainException.forbidden("playerId mismatch");
        }
        this.payload = newPayload;
        this.updatedAt = now;
    }

    public String playerId() { return playerId; }
    public Map<String, Object> payload() { return payload; }
    public String updatedAt() { return updatedAt; }
}
