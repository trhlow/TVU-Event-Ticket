package vn.edu.tvu.auth.identity;

import java.util.Locale;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
@Profile({"dev", "test"})
public class DevStubIdentityProvider implements IdentityProvider {

    @Override
    public ExternalIdentity verify(String externalCredential) {
        if (externalCredential == null) {
            throw invalidCredential();
        }
        var email = externalCredential.trim().toLowerCase(Locale.ROOT);
        if (!email.contains("@") || email.startsWith("@") || email.endsWith("@")) {
            throw invalidCredential();
        }
        return new ExternalIdentity("dev:" + email, email, displayNameFromEmail(email));
    }

    private ResponseStatusException invalidCredential() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid dev credential");
    }

    private String displayNameFromEmail(String email) {
        var localPart = email.substring(0, email.indexOf('@')).trim();
        if (localPart.isBlank()) {
            return email;
        }
        return localPart.substring(0, 1).toUpperCase(Locale.ROOT) + localPart.substring(1);
    }
}
