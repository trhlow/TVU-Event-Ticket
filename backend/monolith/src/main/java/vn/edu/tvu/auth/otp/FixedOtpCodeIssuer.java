package vn.edu.tvu.auth.otp;

import java.security.SecureRandom;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Local convenience: the configured demo address always gets the same code so development does not depend
 * on reading a mailbox. Every other address still gets a real random one. This bean is
 * {@code @Profile({"dev", "test"})} so it cannot exist in production at all, and
 * {@code ProductionSecretsValidator} fails startup if its configuration leaks there.
 */
@Component
@Profile({"dev", "test"})
public class FixedOtpCodeIssuer implements OtpCodeIssuer {

    private final DemoOtpProperties properties;
    private final SecureRandom random = new SecureRandom();

    public FixedOtpCodeIssuer(DemoOtpProperties properties) {
        this.properties = properties;
    }

    @Override
    public String issue(String email) {
        if (properties.matches(email)) {
            return properties.code();
        }
        return "%06d".formatted(random.nextInt(1_000_000));
    }
}
