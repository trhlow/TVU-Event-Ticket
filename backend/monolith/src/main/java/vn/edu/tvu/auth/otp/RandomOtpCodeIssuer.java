package vn.edu.tvu.auth.otp;

import java.security.SecureRandom;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("!dev & !test")
public class RandomOtpCodeIssuer implements OtpCodeIssuer {

    private final SecureRandom random = new SecureRandom();

    @Override
    public String issue(String email) {
        return "%06d".formatted(random.nextInt(1_000_000));
    }
}
