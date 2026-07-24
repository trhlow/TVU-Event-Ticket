package vn.edu.tvu.testsupport;

import java.time.Duration;

import org.mockito.Mockito;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

import vn.edu.tvu.auth.security.CsrfProperties;
import vn.edu.tvu.auth.security.JwtProperties;
import vn.edu.tvu.auth.security.RsaKeyManager;
import vn.edu.tvu.auth.security.TokenRevocationService;
import vn.edu.tvu.auth.service.InternalJwtService;

@TestConfiguration(proxyBeanMethods = false)
public class AuthSecurityTestConfiguration {

    /**
     * The security slice imports {@link vn.edu.tvu.auth.security.SecurityConfig}, whose {@code jwtDecoder}
     * now depends on this Redis-backed service. Slices do not component-scan it, so supply a mock (nothing
     * revoked by default) — full-context tests still get the real bean.
     */
    @Bean
    TokenRevocationService tokenRevocationService() {
        return Mockito.mock(TokenRevocationService.class);
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
