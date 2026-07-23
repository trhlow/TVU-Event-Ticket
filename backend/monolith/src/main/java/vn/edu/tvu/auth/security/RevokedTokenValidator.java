package vn.edu.tvu.auth.security;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Rejects a JWT whose subject (the user id) has been revoked, e.g. after an admin locked the account. Runs
 * as part of the decoder's validator chain, so it applies to every authenticated request without giving up
 * the stateless model for the common (non-revoked) case.
 */
public class RevokedTokenValidator implements OAuth2TokenValidator<Jwt> {

    private final TokenRevocationService revocationService;

    public RevokedTokenValidator(TokenRevocationService revocationService) {
        this.revocationService = revocationService;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        if (revocationService.isRevoked(token.getSubject())) {
            return OAuth2TokenValidatorResult.failure(
                    new OAuth2Error("token_revoked", "Token has been revoked", null));
        }
        return OAuth2TokenValidatorResult.success();
    }
}
