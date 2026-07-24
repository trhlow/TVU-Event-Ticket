package vn.edu.tvu.auth.otp;

import java.util.Locale;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.auth.demo-otp")
public record DemoOtpProperties(String email, String code) {

    public boolean matches(String candidate) {
        return email != null && !email.isBlank() && candidate != null
                && email.trim().toLowerCase(Locale.ROOT).equals(candidate.trim().toLowerCase(Locale.ROOT));
    }
}
