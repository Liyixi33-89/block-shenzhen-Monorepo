package com.blocksz.server.interfaces.rest;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

/**
 * MVC 配置：注册认证参数解析器 + CORS。
 * CORS 白名单环境变量化：BSZ_CORS_ORIGINS（逗号分隔 origin 模式，如 https://play.example.com,https://admin.example.com），
 * 缺省仅放行本机 dev（生产部署必须在 env 显式配置）。
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AuthArgumentResolver authResolver;
    private final String corsOrigins;

    public WebConfig(AuthArgumentResolver authResolver,
                     @Value("${BSZ_CORS_ORIGINS:http://localhost:*,http://127.0.0.1:*}") String corsOrigins) {
        this.authResolver = authResolver;
        this.corsOrigins = corsOrigins;
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(authResolver);
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        String[] patterns = java.util.Arrays.stream(corsOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toArray(String[]::new);
        registry.addMapping("/api/**")
                .allowedOriginPatterns(patterns)
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }
}
