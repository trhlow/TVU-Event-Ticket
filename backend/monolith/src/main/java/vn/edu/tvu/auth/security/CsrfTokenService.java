package vn.edu.tvu.auth.security;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Service;

@Service
public class CsrfTokenService {

    private static final String HMAC_SHA256 = "HmacSHA256";

    private final CsrfProperties properties;

    public CsrfTokenService(CsrfProperties properties) {
        this.properties = properties;
    }

    public String sign(String jti, Instant expiresAt) {
        try {
            var mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(properties.signingSecret().getBytes(StandardCharsets.UTF_8), HMAC_SHA256));
            var payload = jti + expiresAt.getEpochSecond();
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException ex) {
            throw new IllegalStateException("Unable to sign CSRF token", ex);
        }
    }
}
