package vn.edu.tvu.auth.otp;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OtpConfiguration {

    // Five wrong tries destroy the code, matching the security slice's expectation and keeping the count
    // small enough that a guesser cannot walk the 10^6 space.
    @Bean
    OtpStore otpStore(OtpStore.Backend backend) {
        return new OtpStore(backend, 5);
    }
}
