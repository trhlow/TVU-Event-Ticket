package vn.edu.tvu.auth.config;

import org.junit.jupiter.api.Test;

import vn.edu.tvu.auth.otp.DemoOtpProperties;
import vn.edu.tvu.auth.security.CsrfProperties;
import vn.edu.tvu.auth.security.JwtProperties;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProductionSecretsValidatorTest {

    private static final String REAL_SECRET = "a-32-byte-or-longer-production-secret-value";
    private static final String PRIVATE_PEM = "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----";
    private static final String PUBLIC_PEM = "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----";

    /**
     * The realistic operator mistake: copy .env.example, delete the REPLACE_WITH… placeholder text, leave
     * the key. Compose then supplies an empty string, the property record substitutes its dev default, and
     * production runs on a secret that is committed to this repository.
     */
    @Test
    void blankCsrfSecretIsRejected() {
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(""), prodJwt(), noDemoOtp()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("tvu.auth.csrf.signing-secret");
    }

    @Test
    void blankJwtKeyMaterialIsRejected() {
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET),
                new JwtProperties("https://events.example.com", Duration.ofMinutes(15), "k", "", ""), noDemoOtp()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("tvu.auth.jwt");
    }

    @Test
    void halfConfiguredJwtKeyPairIsRejected() {
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET),
                new JwtProperties("https://events.example.com", Duration.ofMinutes(15), "k", PRIVATE_PEM, ""),
                noDemoOtp()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("tvu.auth.jwt");
    }

    @Test
    void rejectsDemoOtpConfigurationInProduction() {
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET), prodJwt(),
                new DemoOtpProperties("sadminevt@tvu.edu.vn", "123456")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("tvu.auth.demo-otp");
    }

    @Test
    void fullyConfiguredSecretsAreAccepted() {
        assertThatCode(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET), prodJwt(), noDemoOtp()))
                .doesNotThrowAnyException();
    }

    private DemoOtpProperties noDemoOtp() {
        return new DemoOtpProperties(null, null);
    }

    private JwtProperties prodJwt() {
        return new JwtProperties("https://events.example.com", Duration.ofMinutes(15), "tvu-prod-2026",
                PRIVATE_PEM, PUBLIC_PEM);
    }
}
