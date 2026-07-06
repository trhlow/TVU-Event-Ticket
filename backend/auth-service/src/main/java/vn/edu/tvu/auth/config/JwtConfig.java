package vn.edu.tvu.auth.config;

import vn.edu.tvu.auth.security.JwtProperties;
import vn.edu.tvu.auth.security.RsaKeyManager;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class JwtConfig {

    @Bean
    RsaKeyManager rsaKeyManager(JwtProperties properties) {
        return RsaKeyManager.fromProperties(properties);
    }
}
