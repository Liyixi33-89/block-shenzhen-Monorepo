package com.blocksz.server.infrastructure.security;

import com.blocksz.server.domain.identity.PasswordEncoder;
import org.bouncycastle.util.encoders.Hex;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;

/**
 * PasswordEncoder 实现：
 *  - 新格式 pbkdf2$iterations$salt$hash（JDK 自带 PBKDF2WithHmacSHA256）；
 *  - 兼容校验 Node 时代旧格式（登录成功由应用层触发升级）：
 *      · scrypt$salt$hash（node:crypto scryptSync 默认参数 N=16384,r=8,p=1,keylen=32）
 *      · 纯 sha256 hex（更早版本）
 */
@Component
public class MultiFormatPasswordEncoder implements PasswordEncoder {

    private static final int ITERATIONS = 60_000;
    private static final int KEYLEN = 256;
    private static final SecureRandom RNG = new SecureRandom();

    @Override
    public String encode(String raw) {
        byte[] salt = new byte[16];
        RNG.nextBytes(salt);
        byte[] hash = pbkdf2(raw, salt, ITERATIONS);
        return "pbkdf2$" + ITERATIONS + "$" + Hex.toHexString(salt) + "$" + Hex.toHexString(hash);
    }

    @Override
    public boolean matches(String raw, String stored) {
        try {
            String[] parts = stored.split("\\$");
            // 新格式：pbkdf2$iter$salt$hash
            if (parts.length == 4 && "pbkdf2".equals(parts[0])) {
                int iters = Integer.parseInt(parts[1]);
                byte[] salt = Hex.decode(parts[2]);
                byte[] expect = Hex.decode(parts[3]);
                return MessageDigest.isEqual(pbkdf2(raw, salt, iters), expect);
            }
            // 旧格式：scrypt$salt$hash（node scryptSync 默认 N=16384,r=8,p=1,keylen=32）
            // 注意：Node 把 salt「字符串」按 UTF-8 字节直接传入（不是 hex 解码），此处保持一致
            if (parts.length == 3 && "scrypt".equals(parts[0])) {
                byte[] salt = parts[1].getBytes(java.nio.charset.StandardCharsets.UTF_8);
                byte[] expect = Hex.decode(parts[2]);
                byte[] calc = scrypt(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8), salt);
                return MessageDigest.isEqual(calc, expect);
            }
            // 更旧：纯 sha256 hex
            if (stored.matches("[0-9a-f]{64}")) {
                byte[] calc = MessageDigest.getInstance("SHA-256")
                        .digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                return Arrays.equals(Hex.encode(calc), stored.toLowerCase().getBytes());
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    @Override
    public boolean needsUpgrade(String stored) {
        return !stored.startsWith("pbkdf2$");
    }

    private static byte[] pbkdf2(String raw, byte[] salt, int iterations) {
        try {
            PBEKeySpec spec = new PBEKeySpec(raw.toCharArray(), salt, iterations, KEYLEN);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (Exception e) {
            throw new IllegalStateException("pbkdf2 failed", e);
        }
    }

    /** node:crypto scryptSync(password, salt, 32) 的等价参数（N=16384, r=8, p=1）。 */
    private static byte[] scrypt(byte[] pwd, byte[] salt) {
        return org.bouncycastle.crypto.generators.SCrypt.generate(pwd, salt, 16384, 8, 1, 32);
    }
}
