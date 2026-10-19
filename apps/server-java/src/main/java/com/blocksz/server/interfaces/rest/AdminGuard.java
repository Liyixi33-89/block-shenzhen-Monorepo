package com.blocksz.server.interfaces.rest;

import com.blocksz.server.application.identity.AuthAppService.UserActor;
import com.blocksz.server.domain.identity.User;
import com.blocksz.server.domain.shared.DomainException;
import org.springframework.web.bind.annotation.*;

/** admin 守卫（内容发布等敏感操作）。 */
public final class AdminGuard {
    private AdminGuard() {}

    public static void require(UserActor actor) {
        if (actor == null || !actor.isAdmin()) {
            throw DomainException.forbidden("forbidden");
        }
    }
}
