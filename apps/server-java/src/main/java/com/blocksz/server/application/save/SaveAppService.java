package com.blocksz.server.application.save;

import com.blocksz.server.domain.save.PlayerSave;
import com.blocksz.server.domain.save.PlayerSaveRepository;
import com.blocksz.server.domain.save.SaveSchema;
import com.blocksz.server.domain.shared.DomainException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

/** Save 用例：云存档拉取 / 全量覆盖上传 / 删除。 */
@Service
public class SaveAppService {

    private final PlayerSaveRepository saves;
    private final SaveSchema schema;

    public SaveAppService(PlayerSaveRepository saves, SaveSchema schema) {
        this.saves = saves;
        this.schema = schema;
    }

    /** 拉取；无存档抛 404（interfaces 翻译）。 */
    public Map<String, Object> download(String playerId) {
        PlayerSave save = saves.findByPlayerId(playerId)
                .orElseThrow(() -> DomainException.notFound("no save"));
        return Map.of("save", save.payload(), "updatedAt", save.updatedAt());
    }

    /** 上传：Schema 校验 → 归属校验（聚合内）→ 覆盖。 */
    @Transactional
    public Map<String, Object> upload(String playerId, Map<String, Object> payload) {
        SaveSchema.Result check = schema.validate(payload);
        if (!check.ok()) {
            throw new SaveValidationException(check.errors());
        }
        PlayerSave save = saves.findByPlayerId(playerId)
                .orElseGet(() -> new PlayerSave(playerId, payload, Instant.now().toString()));
        String now = Instant.now().toString();
        save.overwrite(check.data(), now);
        saves.save(save);
        return Map.of("ok", true, "updatedAt", now);
    }

    @Transactional
    public Map<String, Object> delete(String playerId) {
        saves.deleteByPlayerId(playerId);
        return Map.of("ok", true);
    }

    /** 存档校验失败（422 + issues 列表，对齐 Node 契约）。 */
    public static class SaveValidationException extends RuntimeException {
        private final java.util.List<String> issues;
        public SaveValidationException(java.util.List<String> issues) {
            super("invalid save");
            this.issues = issues;
        }
        public java.util.List<String> issues() { return issues; }
    }
}
