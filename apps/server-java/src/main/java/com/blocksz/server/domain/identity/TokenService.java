package com.blocksz.server.domain.identity;

/** JWT 端口：签发/校验令牌（算法细节在 infrastructure）。 */
public interface TokenService {
    String sign(String userId, User.Role role);
    /** 无效/过期返回 null。 */
    Claims verify(String token);

    record Claims(String userId, String role) {}
}
