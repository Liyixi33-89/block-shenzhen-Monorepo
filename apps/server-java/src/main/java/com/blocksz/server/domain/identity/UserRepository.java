package com.blocksz.server.domain.identity;

import java.util.Optional;

/** Identity 上下文仓库接口（infrastructure 层实现）。 */
public interface UserRepository {
    void save(User user);
    Optional<User> findById(String id);
    Optional<User> findByUsername(String username);
    boolean existsAny();
    long count();
}
