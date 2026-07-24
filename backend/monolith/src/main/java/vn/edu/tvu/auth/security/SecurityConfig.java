package vn.edu.tvu.auth.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.util.StringUtils;
import org.springframework.http.HttpMethod;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtDecoder jwtDecoder,
            CookieCsrfFilter cookieCsrfFilter) throws Exception {
        http
                .csrf(csrf -> csrf.requireCsrfProtectionMatcher(request -> false))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/auth/login", "/.well-known/**", "/actuator/health",
                                "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/events/mine").hasRole("ORGANIZER")
                        .requestMatchers(HttpMethod.GET, "/api/events/stats").hasRole("SUPER_ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/events", "/api/events/*").permitAll()
                        .requestMatchers("/api/events/**").hasRole("ORGANIZER")
                        .requestMatchers(HttpMethod.POST, "/api/reservations").hasRole("SINH_VIEN")
                        .requestMatchers(HttpMethod.GET, "/api/reservations/me").hasRole("SINH_VIEN")
                        // Two matchers, not one: `*` spans exactly one path segment, so the single-event
                        // route does not cover the zero-segment batch route the public listing calls.
                        .requestMatchers(HttpMethod.GET, "/api/ticketing/events/*/availability").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/ticketing/events/availability").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/ticketing/stats").hasRole("SUPER_ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/admin/clubs/stats",
                                "/api/admin/clubs/*/stats").hasRole("SUPER_ADMIN")
                        // ORGANIZER only, deliberately. A super-admin administers club accounts
                        // (/api/admin/**) and reads cross-club statistics (/api/ticketing/stats,
                        // /api/events/stats); it does not act inside a club's scope. The service layer
                        // enforces the same rule, but stating it here keeps the decision in one place
                        // instead of relying on every future club-scoped endpoint to re-check.
                        .requestMatchers("/api/reservations/**", "/api/ticketing/**", "/api/tickets/**")
                        .hasRole("ORGANIZER")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .bearerTokenResolver(bearerTokenResolver())
                        .jwt(jwt -> jwt
                                .decoder(jwtDecoder)
                                .jwtAuthenticationConverter(jwtAuthenticationConverter())))
                .addFilterAfter(cookieCsrfFilter, BearerTokenAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    BearerTokenResolver bearerTokenResolver() {
        var headerResolver = new DefaultBearerTokenResolver();
        return request -> {
            var headerToken = headerResolver.resolve(request);
            if (StringUtils.hasText(headerToken)) {
                return headerToken;
            }
            var cookies = request.getCookies();
            if (cookies == null) {
                return null;
            }
            for (var cookie : cookies) {
                if ("TVU_AUTH".equals(cookie.getName()) && StringUtils.hasText(cookie.getValue())) {
                    return cookie.getValue();
                }
            }
            return null;
        };
    }

    @Bean
    FilterRegistrationBean<CookieCsrfFilter> cookieCsrfFilterRegistration(CookieCsrfFilter filter) {
        var registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    JwtDecoder jwtDecoder(RsaKeyManager keyManager, JwtProperties properties,
                          TokenRevocationService tokenRevocationService) {
        var decoder = NimbusJwtDecoder.withPublicKey(keyManager.publicKey()).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(properties.issuer()),
                new RevokedTokenValidator(tokenRevocationService)));
        return decoder;
    }

    private JwtAuthenticationConverter jwtAuthenticationConverter() {
        var authoritiesConverter = new JwtGrantedAuthoritiesConverter();
        authoritiesConverter.setAuthoritiesClaimName("roles");
        authoritiesConverter.setAuthorityPrefix("ROLE_");
        var authenticationConverter = new JwtAuthenticationConverter();
        authenticationConverter.setJwtGrantedAuthoritiesConverter(authoritiesConverter);
        return authenticationConverter;
    }
}
