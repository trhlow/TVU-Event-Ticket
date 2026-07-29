package vn.edu.tvu.auth.otp;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class FixedOtpCodeIssuerTest {

    private final FixedOtpCodeIssuer issuer = new FixedOtpCodeIssuer(
            new DemoOtpProperties(List.of("sadminevt@tvu.edu.vn", "adminclb@tvu.edu.vn"), "123456"));

    @Test
    void everyConfiguredDemoEmailGetsTheFixedCode() {
        assertThat(issuer.issue("sadminevt@tvu.edu.vn")).isEqualTo("123456");
        assertThat(issuer.issue("adminclb@tvu.edu.vn")).isEqualTo("123456");
    }

    @Test
    void demoEmailMatchIgnoresCaseAndSurroundingWhitespace() {
        assertThat(issuer.issue("  AdminCLB@TVU.edu.vn ")).isEqualTo("123456");
    }

    @Test
    void otherEmailsStillGetASixDigitCode() {
        assertThat(issuer.issue("someone.else@tvu.edu.vn")).matches("\\d{6}");
    }

    @Test
    void unconfiguredDemoOtpNeverMatchesAndNeverReturnsNull() {
        FixedOtpCodeIssuer bare = new FixedOtpCodeIssuer(new DemoOtpProperties(null, null));
        assertThat(bare.issue("sadminevt@tvu.edu.vn")).matches("\\d{6}");
    }
}
