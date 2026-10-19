package com.blocksz.server.infrastructure.security;

import com.blocksz.server.domain.identity.TokenService;
import com.blocksz.server.domain.identity.User;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Date;

/** TokenService 的 jjwt 实现（HS256，TTL 可配）。 */
@Component
public class JwtTokenService implements TokenService {

    private final SecretKey key;
    private final Duration ttl;

    public JwtTokenService(@Value("${app.jwt.secret}") String secret,
                            @Value("${app.jwt.ttl-hours:12}") long ttlHours) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.ttl = Duration.ofHours(ttlHours);
    }

    @Override
    public String sign(String userId, User.Role role) {
        Date now = new Date();
        return Jwts.builder()
                .subject(userId)
                .claim("role", role.name().toLowerCase())
                .issuedAt(now)
                .expiration(new Date(now.getTime() + ttl.toMillis()))
                .signWith(key)
                .compact();
    }

    @Override
    public Claims verify(String token) {
        try {
            io.jsonwebtoken.Claims c = Jwts.parser().verifyWith(key).build()
                    .parseSignedClaims(token).getPayload();
            String role = c.get("role", String.class);
            if (role == null) return null;
            return new Claims(c.getSubject(), role);
        } catch (Exception e) {
            return null;
        }
    }
}
