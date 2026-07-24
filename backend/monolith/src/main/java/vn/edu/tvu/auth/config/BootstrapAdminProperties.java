package vn.edu.tvu.auth.config;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.auth.bootstrap")
public record BootstrapAdminProperties(String email) {

    /**
     * A deployment names more than one address so a single unreachable mailbox cannot lock every super
     * admin out of an application that has no password to fall back on.
     */
    public List<String> emails() {
        if (email == null || email.isBlank()) {
            return List.of();
        }
        return Arrays.stream(email.split(","))
                .map(value -> value.trim().toLowerCase(Locale.ROOT))
                .filter(value -> !value.isEmpty())
                .toList();
    }
}
