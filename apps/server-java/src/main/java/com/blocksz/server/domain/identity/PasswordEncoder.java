package com.blocksz.server.domain.identity;

/** 密码编码端口：领域层只声明「哈希/校验/判断是否需升级」，算法在 infrastructure 实现。 */
public interface PasswordEncoder {
    String encode(String rawPassword);
    boolean matches(String rawPassword, String storedHash);
    /** 旧格式（scrypt$/sha256）登录成功后应升级为新格式。 */
    boolean needsUpgrade(String storedHash);
}
