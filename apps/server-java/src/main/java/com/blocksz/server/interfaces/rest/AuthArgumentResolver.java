package com.blocksz.server.interfaces.rest;

import com.blocksz.server.application.identity.AuthAppService;
import com.blocksz.server.domain.identity.TokenService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/**
 * 认证参数解析器：Bearer 头或 bsz_token Cookie → UserActor。
 * 所有标注 @Auth 的控制器参数由此注入；无效凭证直接 401。
 */
@Component
public class AuthArgumentResolver implements HandlerMethodArgumentResolver {

    public static final String COOKIE = "bsz_token";

    private final TokenService tokens;

    public AuthArgumentResolver(TokenService tokens) {
        this.tokens = tokens;
    }

    @Override
    public boolean supportsParameter(MethodParameter p) {
        return p.hasParameterAnnotation(Auth.class)
                && p.getParameterType().equals(AuthAppService.UserActor.class);
    }

    @Override
    public Object resolveArgument(MethodParameter p, ModelAndViewContainer mav,
                                  NativeWebRequest web, WebDataBinderFactory binder) {
        String token = extract(web);
        TokenService.Claims claims = token == null ? null : tokens.verify(token);
        if (claims == null) {
            throw new com.blocksz.server.domain.shared.DomainException(401, "unauthorized");
        }
        String username = web.getHeader("X-Player-Name");
        return new AuthAppService.UserActor(claims.userId(),
                "admin".equals(claims.role())
                        ? com.blocksz.server.domain.identity.User.Role.ADMIN
                        : com.blocksz.server.domain.identity.User.Role.PLAYER,
                username == null ? "游客" : username);
    }

    /** Bearer 优先，其次 Cookie。 */
    public static String extract(NativeWebRequest web) {
        String header = web.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) return header.substring(7);
        jakarta.servlet.http.HttpServletRequest req = web.getNativeRequest(HttpServletRequest.class);
        if (req != null && req.getCookies() != null) {
            for (jakarta.servlet.http.Cookie c : req.getCookies()) {
                if (COOKIE.equals(c.getName()) && !c.getValue().isBlank()) return c.getValue();
            }
        }
        return null;
    }
}
