package com.blocksz.server.domain.identity;

import java.util.List;
import java.util.Optional;

/** Identity 上下文仓库接口（infrastructure 层实现）。 */
public interface UserRepository {
    void save(User user);
    Optional<User> findById(String id);
    Optional<User> findByUsername(String username);
    boolean existsAny();
    long count();

    /** 用户列表（admin）：按用户名模糊搜索（空串=全部），按注册时间倒序分页。 */
    List<User> search(String keyword, int limit, int offset);
}
