package com.blocksz.server.interfaces.rest;

import com.blocksz.server.application.identity.AuthAppService;
import com.blocksz.server.application.identity.AuthAppService.UserActor;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 认证接口：注册 / 登录 / 当前用户（P0：限流 + 邀请码）。 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthAppService auth;
    private final RateLimitGuard rateLimit;

    public AuthController(AuthAppService auth, RateLimitGuard rateLimit) {
        this.auth = auth;
        this.rateLimit = rateLimit;
    }

    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody Map<String, Object> body,
                                        HttpServletRequest req,
                                        HttpServletResponse res) {
        rateLimit.checkRegister(req);
        String username = str(body.get("username"));
        String password = str(body.get("password"));
        String inviteCode = str(body.get("inviteCode"));
        var out = auth.register(username, password, inviteCode);
        setCookie(res, (String) out.get("token"));
        return out;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> body,
                                     HttpServletRequest req,
                                     HttpServletResponse res) {
        rateLimit.checkLogin(str(body.get("username")), req);
        var out = auth.login(str(body.get("username")), str(body.get("password")));
        res.setHeader("Set-Cookie", AuthArgumentResolver.COOKIE + "=" + out.get("token")
                + "; HttpOnly; Path=/; SameSite=Lax");
        return out;
    }

    @GetMapping("/me")
    public Map<String, Object> me(@Auth UserActor actor) {
        return auth.me(actor);
    }

    /** HttpOnly Cookie（SameSite=Lax），对齐 Node register 行为。 */
    private static void setCookie(HttpServletResponse res, String token) {
        res.setHeader("Set-Cookie", AuthArgumentResolver.COOKIE + "=" + token
                + "; HttpOnly; Path=/; SameSite=Lax");
    }

    private static String str(Object o) { return o instanceof String s ? s : ""; }
}
