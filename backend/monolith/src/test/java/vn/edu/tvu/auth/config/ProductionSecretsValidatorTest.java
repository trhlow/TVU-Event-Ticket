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
    private static vn.edu.tvu.auth.otp.OtpProperties strongPepper() {
        return new vn.edu.tvu.auth.otp.OtpProperties("Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaQ==");
    }

    private static BootstrapAdminProperties twoAdmins() {
        return new BootstrapAdminProperties("truong@tvu.edu.vn,pho@tvu.edu.vn");
    }

    @Test
    void blankCsrfSecretIsRejected() {
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(""), prodJwt(), noDemoOtp(), strongPepper(), twoAdmins()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("tvu.auth.csrf.signing-secret");
    }

    @Test
    void blankJwtKeyMaterialIsRejected() {
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET),
                new JwtProperties("https://events.example.com", Duration.ofMinutes(15), "k", "", ""), noDemoOtp(), strongPepper(), twoAdmins()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("tvu.auth.jwt");
    }

    @Test
    void halfConfiguredJwtKeyPairIsRejected() {
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET),
                new JwtProperties("https://events.example.com", Duration.ofMinutes(15), "k", PRIVATE_PEM, ""),
                noDemoOtp(), strongPepper(), twoAdmins()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("tvu.auth.jwt");
    }

    @Test
    void rejectsDemoOtpConfigurationInProduction() {
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET), prodJwt(),
                new DemoOtpProperties(java.util.List.of("sadminevt@tvu.edu.vn", "adminclb@tvu.edu.vn"), "123456"),
                strongPepper(), twoAdmins()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("tvu.auth.demo-otp");
    }

    @Test
    void developmentPepperIsRejected() {
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET), prodJwt(),
                noDemoOtp(), new vn.edu.tvu.auth.otp.OtpProperties(null), twoAdmins()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("tvu.auth.otp.pepper");
    }

    @Test
    void shortPepperIsRejected() {
        // A six-digit code has a million possibilities; a weak pepper is reversed offline from a
        // Redis dump in moments, which is the whole thing the pepper exists to prevent.
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET), prodJwt(),
                noDemoOtp(), new vn.edu.tvu.auth.otp.OtpProperties("too-short"), twoAdmins()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("too short");
    }

    @Test
    void aSingleBootstrapAdminIsRejected() {
        // Sign-in is passwordless: if that one mailbox is unreachable, nobody can administer the
        // deployment and no other account has the rights to fix it.
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET), prodJwt(),
                noDemoOtp(), strongPepper(), new BootstrapAdminProperties("only@tvu.edu.vn")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("at least 2");
    }

    @Test
    void duplicateBootstrapAdminsAreRejected() {
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET), prodJwt(),
                noDemoOtp(), strongPepper(),
                new BootstrapAdminProperties("truong@tvu.edu.vn,truong@tvu.edu.vn")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("twice");
    }

    @Test
    void malformedBootstrapAdminIsRejected() {
        assertThatThrownBy(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET), prodJwt(),
                noDemoOtp(), strongPepper(),
                new BootstrapAdminProperties("truong@tvu.edu.vn,not-an-email")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("invalid address");
    }

    @Test
    void fullyConfiguredSecretsAreAccepted() {
        assertThatCode(() -> new ProductionSecretsValidator(new CsrfProperties(REAL_SECRET), prodJwt(), noDemoOtp(), strongPepper(), twoAdmins()))
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
