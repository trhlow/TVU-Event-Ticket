package vn.edu.tvu.auth.otp;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OtpConfiguration {

    // Five wrong tries destroy the code, matching the security slice's expectation and keeping the count
    // small enough that a guesser cannot walk the 10^6 space.
    //
    // Ten sends a day is well above what a chair and vice-chair need — a trusted browser lasts 30 days —
    // and low enough that a resend loop cannot spend the mail provider's quota, which is the only way in.
    @Bean
    OtpStore otpStore(OtpStore.Backend backend) {
        return new OtpStore(backend, 5, 10);
    }
}
