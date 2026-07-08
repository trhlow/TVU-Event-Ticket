package vn.edu.tvu.gateway.security;

import reactor.core.publisher.Mono;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.BearerTokenAuthenticationToken;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.authentication.ReactiveJwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.ReactiveJwtGrantedAuthoritiesConverterAdapter;
import org.springframework.security.oauth2.server.resource.web.server.authentication.ServerBearerTokenAuthenticationConverter;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.security.web.server.authentication.ServerAuthenticationConverter;
import org.springframework.util.StringUtils;

import org.springframework.core.convert.converter.Converter;

@Configuration
@EnableWebFluxSecurity
@EnableConfigurationProperties(GatewayAuthProperties.class)
public class GatewaySecurityConfig {

    @Bean
    SecurityWebFilterChain securityWebFilterChain(
            ServerHttpSecurity http,
            ServerAuthenticationConverter bearerTokenConverter,
            Converter<Jwt, Mono<AbstractAuthenticationToken>> jwtAuthenticationConverter) {
        http
                .csrf(ServerHttpSecurity.CsrfSpec::disable)
                .authorizeExchange(auth -> auth
                        .pathMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        .pathMatchers("/.well-known/**", "/actuator/health").permitAll()
                        .pathMatchers("/api/admin/**").hasRole("SUPER_ADMIN")
                        .pathMatchers(HttpMethod.POST, "/api/reservations").hasRole("SINH_VIEN")
                        .pathMatchers(HttpMethod.GET, "/api/reservations/me").hasRole("SINH_VIEN")
                        .pathMatchers(HttpMethod.GET, "/api/reservations/pending").hasRole("ORGANIZER")
                        .pathMatchers(HttpMethod.PATCH, "/api/reservations/*/approve").hasRole("ORGANIZER")
                        .pathMatchers(HttpMethod.PATCH, "/api/reservations/*/reject").hasRole("ORGANIZER")
                        .pathMatchers(HttpMethod.POST, "/api/tickets/inventories")
                        .hasAnyRole("ORGANIZER", "SUPER_ADMIN")
                        .pathMatchers("/api/tickets/**", "/api/reservations/**").authenticated()
                        .pathMatchers("/api/events/**").authenticated()
                        .anyExchange().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .bearerTokenConverter(bearerTokenConverter)
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter)));
        return http.build();
    }

    @Bean
    ServerAuthenticationConverter bearerTokenConverter(GatewayAuthProperties properties) {
        var headerConverter = new ServerBearerTokenAuthenticationConverter();
        return exchange -> headerConverter.convert(exchange)
                .switchIfEmpty(Mono.defer(() -> {
                    var cookie = exchange.getRequest().getCookies().getFirst(properties.jwtCookieName());
                    if (cookie == null || !StringUtils.hasText(cookie.getValue())) {
                        return Mono.empty();
                    }
                    return Mono.just(new BearerTokenAuthenticationToken(cookie.getValue()));
                }));
    }

    @Bean
    Converter<Jwt, Mono<AbstractAuthenticationToken>> jwtAuthenticationConverter() {
        var authoritiesConverter = new JwtGrantedAuthoritiesConverter();
        authoritiesConverter.setAuthoritiesClaimName("roles");
        authoritiesConverter.setAuthorityPrefix("ROLE_");
        var authenticationConverter = new ReactiveJwtAuthenticationConverter();
        authenticationConverter.setJwtGrantedAuthoritiesConverter(
                new ReactiveJwtGrantedAuthoritiesConverterAdapter(authoritiesConverter));
        return authenticationConverter;
    }
}
