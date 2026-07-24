package vn.edu.tvu.auth.config;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import vn.edu.tvu.auth.security.CsrfProperties;
import vn.edu.tvu.auth.security.JwtProperties;

/**
 * Refuses to start production with placeholder or absent signing material.
 *
 * <p>{@code CsrfProperties} and {@code JwtProperties} deliberately fall back to development defaults so
 * that dev and test contexts need no configuration. That fallback is silent, and Docker Compose
 * {@code env_file} turns a half-filled {@code .env} line ({@code CSRF_SIGNING_SECRET=}) into an empty
 * string rather than an absent variable — so placeholder resolution succeeds and the dev default applies
 * in production. The consequences are invisible at runtime: CSRF tokens signed with a secret committed to
 * this repository, and an ephemeral RSA keypair that silently invalidates every session on restart and
 * makes any second replica reject the first's tokens.
 *
 * <p>The check lives in a {@code @Profile("prod")} bean rather than in the property records themselves
 * because {@code @ConfigurationPropertiesScan} binds those records under every profile; throwing there
 * would break dev and test contexts that never use production secrets.
 */
@Component
@Profile("prod")
public class ProductionSecretsValidator {

    private static final String DEV_CSRF_SECRET = "dev-csrf-signing-secret-change-me";

    public ProductionSecretsValidator(CsrfProperties csrfProperties, JwtProperties jwtProperties) {
        if (!hasText(csrfProperties.signingSecret()) || DEV_CSRF_SECRET.equals(csrfProperties.signingSecret())) {
            throw new IllegalStateException("tvu.auth.csrf.signing-secret must be set to a real secret in "
                    + "production; the development default is committed to this repository");
        }
        if (!hasText(jwtProperties.privateKeyPem()) || !hasText(jwtProperties.publicKeyPem())) {
            throw new IllegalStateException("tvu.auth.jwt.private-key-pem and tvu.auth.jwt.public-key-pem must "
                    + "both be set in production; otherwise an ephemeral keypair is generated per process, "
                    + "invalidating every session on restart");
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
