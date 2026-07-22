package vn.edu.tvu.auth.identity;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSVerifier;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWKMatcher;
import com.nimbusds.jose.jwk.JWKSelector;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.SignedJWT;

import java.text.ParseException;
import java.time.Instant;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
@Profile("prod")
public class MicrosoftIdentityProvider implements IdentityProvider {

    private final MicrosoftIdentityProperties properties;
    private final MicrosoftJwkSetClient jwkSetClient;

    public MicrosoftIdentityProvider(MicrosoftIdentityProperties properties, MicrosoftJwkSetClient jwkSetClient) {
        // Validated here rather than in the properties record's constructor: @ConfigurationPropertiesScan
        // binds that record under every profile, so failing there would break dev and test contexts that
        // never use Microsoft login at all. This class is @Profile("prod"), so the check fires exactly
        // where a missing tenant id would be a live vulnerability.
        if (properties.tenantId() == null || properties.tenantId().isBlank()) {
            throw new IllegalArgumentException(
                    "tvu.auth.microsoft.tenant-id must be set: without it every Microsoft directory is trusted");
        }
        this.properties = properties;
        this.jwkSetClient = jwkSetClient;
    }

    @Override
    public ExternalIdentity verify(String externalCredential) {
        try {
            var jwt = SignedJWT.parse(externalCredential);
            verifySignature(jwt);
            var claims = jwt.getJWTClaimsSet();
            if (!claims.getAudience().contains(properties.clientId())) {
                throw unauthorized("invalid Microsoft token audience");
            }
            // Pin the tenant to the configured directory. Deriving the expected issuer from the token's
            // own tid claim would only prove the token is self-consistent, which every genuine Microsoft
            // token from every directory is -- so a token minted for this client in any other tenant
            // would pass. The app registration being single-tenant is what stops those tokens today, but
            // that is cloud config, not a server-side boundary.
            var tid = claims.getStringClaim("tid");
            if (!properties.tenantId().equals(tid)) {
                throw unauthorized("invalid Microsoft token tenant");
            }
            var expectedIssuer = properties.issuerHost() + "/" + tid + "/v2.0";
            if (!expectedIssuer.equals(claims.getIssuer())) {
                throw unauthorized("invalid Microsoft token issuer");
            }
            if (claims.getExpirationTime() == null || claims.getExpirationTime().toInstant().isBefore(Instant.now())) {
                throw unauthorized("expired Microsoft token");
            }
            // nbf is how Entra marks a token that is issued but not yet active; checking only exp would
            // accept it for the whole pre-activation window.
            if (claims.getNotBeforeTime() != null
                    && claims.getNotBeforeTime().toInstant().isAfter(Instant.now().plusSeconds(60))) {
                throw unauthorized("Microsoft token is not yet valid");
            }
            var email = firstNonBlank(
                    claims.getStringClaim("preferred_username"),
                    claims.getStringClaim("email"),
                    claims.getStringClaim("upn"));
            if (email == null) {
                throw unauthorized("missing Microsoft account email");
            }
            var displayName = firstNonBlank(claims.getStringClaim("name"), email);
            return new ExternalIdentity("ms:" + tid + ":" + claims.getSubject(), email, displayName);
        } catch (ParseException ex) {
            throw unauthorized("invalid Microsoft token");
        }
    }

    private void verifySignature(SignedJWT jwt) {
        try {
            if (!JWSAlgorithm.RS256.equals(jwt.getHeader().getAlgorithm())) {
                throw unauthorized("invalid Microsoft token algorithm");
            }
            var selector = new JWKSelector(new JWKMatcher.Builder()
                    .keyID(jwt.getHeader().getKeyID())
                    .build());
            // An unknown key id is the normal appearance of a Microsoft key rotation. Retry once against a
            // freshly fetched set before rejecting, otherwise a cached JWKS turns every rotation into a
            // total login outage lasting until the cache expires.
            var key = selectRsaKey(selector, false)
                    .or(() -> selectRsaKey(selector, true))
                    .orElseThrow(() -> unauthorized("Microsoft signing key not found"));
            JWSVerifier verifier = new RSASSAVerifier(key.toRSAPublicKey());
            if (!jwt.verify(verifier)) {
                throw unauthorized("invalid Microsoft token signature");
            }
        } catch (com.nimbusds.jose.JOSEException ex) {
            throw unauthorized("invalid Microsoft token signature");
        }
    }

    private java.util.Optional<RSAKey> selectRsaKey(JWKSelector selector, boolean forceRefresh) {
        return selector.select(jwkSetClient.fetch(forceRefresh)).stream()
                .filter(RSAKey.class::isInstance)
                .map(RSAKey.class::cast)
                .findFirst();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private ResponseStatusException unauthorized(String reason) {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, reason);
    }
}
