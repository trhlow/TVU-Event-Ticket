package vn.edu.tvu.auth.otp;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param pepper secret mixed into the HMAC of every one-time code, so a Redis dump does not hand
 *               over live admin codes. Must be its own secret — reusing the JWT key, the CSRF
 *               secret, the QR signing key or the SMTP password means one leak compromises both
 *               things at once. {@code ProductionSecretsValidator} enforces both its presence and
 *               its strength under the prod profile; the development default below keeps dev and
 *               test contexts running without configuration.
 */
@ConfigurationProperties(prefix = "tvu.auth.otp")
public record OtpProperties(String pepper) {

    public static final String DEV_PEPPER = "dev-otp-pepper-change-me";

    public OtpProperties {
        if (pepper == null || pepper.isBlank()) {
            pepper = DEV_PEPPER;
        }
    }
}
