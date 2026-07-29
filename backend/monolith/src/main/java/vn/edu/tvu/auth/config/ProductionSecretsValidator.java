package vn.edu.tvu.auth.config;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Locale;
import java.util.regex.Pattern;

import vn.edu.tvu.auth.otp.DemoOtpProperties;
import vn.edu.tvu.auth.otp.OtpProperties;
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

    /** 32 random bytes, Base64-encoded, is 44 characters. Shorter means it was not generated that way. */
    private static final int MIN_PEPPER_LENGTH = 44;

    /** Two, so one unreachable mailbox cannot lock every super admin out of a passwordless system. */
    private static final int MIN_BOOTSTRAP_ADMINS = 2;

    private static final Pattern EMAIL = Pattern.compile("^[^@ ]+@[^@ ]+[.][^@ ]{2,}$");

    public ProductionSecretsValidator(CsrfProperties csrfProperties, JwtProperties jwtProperties,
            DemoOtpProperties demoOtpProperties, OtpProperties otpProperties,
            BootstrapAdminProperties bootstrapProperties) {
        if (!hasText(csrfProperties.signingSecret()) || DEV_CSRF_SECRET.equals(csrfProperties.signingSecret())) {
            throw new IllegalStateException("tvu.auth.csrf.signing-secret must be set to a real secret in "
                    + "production; the development default is committed to this repository");
        }
        if (!hasText(jwtProperties.privateKeyPem()) || !hasText(jwtProperties.publicKeyPem())) {
            throw new IllegalStateException("tvu.auth.jwt.private-key-pem and tvu.auth.jwt.public-key-pem must "
                    + "both be set in production; otherwise an ephemeral keypair is generated per process, "
                    + "invalidating every session on restart");
        }
        if (demoOtpProperties != null && demoOtpProperties.configured()) {
            throw new IllegalStateException("tvu.auth.demo-otp must not be configured in production; it is a "
                    + "development convenience with a fixed code committed to this repository");
        }
        validateOtpPepper(otpProperties);
        validateBootstrapAdmins(bootstrapProperties);
    }

    /**
     * Strength, not merely presence. A short or guessable pepper is no better than none: a six-digit
     * code has only a million possibilities, so anyone holding a Redis dump can try them all against
     * a weak pepper in moments and recover a live admin code.
     */
    private static void validateOtpPepper(OtpProperties otpProperties) {
        var pepper = otpProperties == null ? null : otpProperties.pepper();
        if (!hasText(pepper) || OtpProperties.DEV_PEPPER.equals(pepper)) {
            throw new IllegalStateException("tvu.auth.otp.pepper must be set to a real secret in production; "
                    + "the development default is committed to this repository");
        }
        if (pepper.length() < MIN_PEPPER_LENGTH) {
            throw new IllegalStateException("tvu.auth.otp.pepper is too short (" + pepper.length()
                    + " chars); generate at least 32 random bytes, e.g. openssl rand -base64 32");
        }
    }

    /**
     * Configuration-level checks only — no database access, so this runs before anything has been
     * created. The data-level guarantees (every address exists as an active super admin) belong to
     * {@code BootstrapSuperAdminRunner}, which runs after Flyway.
     */
    private static void validateBootstrapAdmins(BootstrapAdminProperties bootstrapProperties) {
        var emails = bootstrapProperties == null ? java.util.List.<String>of() : bootstrapProperties.emails();
        if (emails.size() < MIN_BOOTSTRAP_ADMINS) {
            throw new IllegalStateException("tvu.auth.bootstrap.email must list at least "
                    + MIN_BOOTSTRAP_ADMINS + " addresses; sign-in is passwordless, so a single unreachable "
                    + "mailbox locks every super admin out with no way back in");
        }
        var seen = new HashSet<String>();
        for (var email : emails) {
            if (!EMAIL.matcher(email).matches()) {
                throw new IllegalStateException("tvu.auth.bootstrap.email contains an invalid address: " + email);
            }
            if (!seen.add(email.toLowerCase(Locale.ROOT))) {
                throw new IllegalStateException("tvu.auth.bootstrap.email lists " + email + " twice; two "
                        + "entries pointing at one mailbox provide no redundancy at all");
            }
        }
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
