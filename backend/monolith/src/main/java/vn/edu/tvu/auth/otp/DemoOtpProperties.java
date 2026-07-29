package vn.edu.tvu.auth.otp;

import java.util.List;
import java.util.Locale;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.auth.demo-otp")
public record DemoOtpProperties(List<String> emails, String code) {

    public boolean matches(String candidate) {
        if (emails == null || candidate == null) {
            return false;
        }
        String normalized = candidate.trim().toLowerCase(Locale.ROOT);
        return emails.stream()
                .filter(email -> email != null && !email.isBlank())
                .anyMatch(email -> email.trim().toLowerCase(Locale.ROOT).equals(normalized));
    }

    public boolean configured() {
        return (emails != null && emails.stream().anyMatch(email -> email != null && !email.isBlank()))
                || (code != null && !code.isBlank());
    }
}
