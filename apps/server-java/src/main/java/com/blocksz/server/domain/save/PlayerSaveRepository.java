package com.blocksz.server.domain.save;

import java.util.Optional;

/** Save 上下文仓库接口。 */
public interface PlayerSaveRepository {
    void save(PlayerSave save);
    Optional<PlayerSave> findByPlayerId(String playerId);
    void deleteByPlayerId(String playerId);
}
