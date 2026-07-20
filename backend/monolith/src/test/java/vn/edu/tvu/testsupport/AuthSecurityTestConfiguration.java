package vn.edu.tvu.testsupport;

import java.time.Duration;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

import vn.edu.tvu.auth.security.CsrfProperties;
import vn.edu.tvu.auth.security.JwtProperties;
import vn.edu.tvu.auth.security.RsaKeyManager;
import vn.edu.tvu.auth.service.InternalJwtService;

@TestConfiguration(proxyBeanMethods = false)
public class AuthSecurityTestConfiguration {

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
