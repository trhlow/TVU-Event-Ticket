package vn.edu.tvu.testsupport;

import java.time.Duration;

import java.util.Optional;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

import vn.edu.tvu.auth.security.CsrfProperties;
import vn.edu.tvu.auth.security.JwtProperties;
import vn.edu.tvu.auth.security.RsaKeyManager;
import vn.edu.tvu.auth.security.AuthVersionLookup;
import vn.edu.tvu.auth.service.InternalJwtService;

@TestConfiguration(proxyBeanMethods = false)
public class AuthSecurityTestConfiguration {

    /**
     * The security slice imports {@link vn.edu.tvu.auth.security.SecurityConfig}, whose {@code jwtDecoder}
     * needs the current auth_version for the token's subject. Slices do not component-scan the
     * database-backed implementation, so answer 0 for everyone — matching the version these tests mint
     * their tokens with, i.e. "nothing has been revoked". Full-context tests get the real bean.
     */
    @Bean
    AuthVersionLookup authVersionLookup() {
        return userId -> Optional.of(0L);
    }

    @Bean
    JwtProperties jwtProperties() {
        return new JwtProperties("http://test-issuer", Duration.ofMinutes(15), "test-key", null, null);
    }

    @Bean
    CsrfProperties csrfProperties() {
        return new CsrfProperties("test-csrf-signing-secret");
    }

    @Bean
    RsaKeyManager rsaKeyManager(JwtProperties properties) {
        return RsaKeyManager.fromProperties(properties);
    }

    @Bean
    InternalJwtService internalJwtService(JwtProperties properties, RsaKeyManager keyManager) {
        return new InternalJwtService(properties, keyManager);
    }
}
