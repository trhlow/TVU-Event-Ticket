package vn.edu.tvu.auth.security;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Accepts a JWT only while its {@code auth_version} claim still equals the value stored for that
 * user. Every security-relevant revocation — locking an organiser, deactivating a club, signing
 * out everywhere — bumps the stored number in the same database transaction that changes the
 * state, so tokens issued before it stop working on the next request.
 *
 * <p>Replaces a boolean "this user is revoked" flag in Redis, which rejected <em>every</em> token
 * of that user for a full JWT TTL — including one minted seconds later by a fresh, legitimate
 * sign-in. Signing out everywhere and signing straight back in returned 401 for 15 minutes.
 *
 * <p>Equality, not a timestamp: comparing numbers has no clock skew and no millisecond ties, which
 * is why an earlier "revoked before this instant" design was dropped.
 *
 * <p>Cost, stated plainly: this reads the database on every authenticated request. That is the
 * price of giving up a purely stateless token, and it is deliberate — see {@link AuthVersionLookup}
 * for why a cache cannot simply be dropped in front of it.
 */
public class AuthVersionValidator implements OAuth2TokenValidator<Jwt> {

    static final String CLAIM = "auth_version";
    private static final Logger LOGGER = LoggerFactory.getLogger(AuthVersionValidator.class);

    private final AuthVersionLookup lookup;

    public AuthVersionValidator(AuthVersionLookup lookup) {
        this.lookup = lookup;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        UUID userId;
        try {
            userId = UUID.fromString(token.getSubject());
        } catch (IllegalArgumentException | NullPointerException ex) {
            return failure("Token subject is not a user id");
        }

        // Tokens minted before this claim existed have no version. Defaulting them to 0 would
        // wave through every token issued by the previous build, so absent means rejected.
        var claimed = token.getClaim(CLAIM);
        if (!(claimed instanceof Number claimedVersion)) {
            return failure("Token carries no usable auth_version claim");
        }

        try {
            return lookup.currentAuthVersion(userId)
                    .filter(current -> current == claimedVersion.longValue())
                    .map(current -> OAuth2TokenValidatorResult.success())
                    .orElseGet(() -> failure("Token auth_version is stale or the user is gone"));
        } catch (RuntimeException ex) {
            // Fail closed. If the database cannot answer, the safe answer is "not authenticated";
            // the alternative turns an outage into an authentication bypass.
            LOGGER.warn("auth_version lookup failed for userId={}, rejecting request", userId, ex);
            return failure("Could not verify token state");
        }
    }

    private static OAuth2TokenValidatorResult failure(String description) {
        return OAuth2TokenValidatorResult.failure(new OAuth2Error("token_revoked", description, null));
    }
}
