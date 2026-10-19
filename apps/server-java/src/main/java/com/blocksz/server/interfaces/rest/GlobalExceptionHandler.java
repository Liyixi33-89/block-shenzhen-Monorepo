package com.blocksz.server.interfaces.rest;

import com.blocksz.server.application.content.ContentAppService;
import com.blocksz.server.application.save.SaveAppService;
import com.blocksz.server.domain.shared.DomainException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/** 领域异常 → HTTP 响应翻译（错误体 { error } 对齐 Node 契约）。 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(DomainException.class)
    public ResponseEntity<Map<String, Object>> domain(DomainException e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", e.getMessage()));
    }

    /** 存档/场景校验失败：422 + issues 列表。 */
    @ExceptionHandler(SaveAppService.SaveValidationException.class)
    public ResponseEntity<Map<String, Object>> saveInvalid(SaveAppService.SaveValidationException e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "invalid save");
        body.put("issues", e.issues().stream().map(i -> Map.of("message", i)).toList());
        return ResponseEntity.unprocessableEntity().body(body);
    }

    @ExceptionHandler(ContentAppService.SceneValidationException.class)
    public ResponseEntity<Map<String, Object>> sceneInvalid(ContentAppService.SceneValidationException e) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", "invalid scene");
        body.put("issues", e.issues().stream().map(i -> Map.of("message", i)).toList());
        return ResponseEntity.unprocessableEntity().body(body);
    }

    /** 兜底：未预期异常 500（不泄露内部细节）。 */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpected(Exception e) {
        log.error("[server] unhandled: ", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "internal error"));
    }
}
