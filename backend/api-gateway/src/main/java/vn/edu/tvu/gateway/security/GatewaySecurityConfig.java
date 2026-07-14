package vn.edu.tvu.gateway.security;

import reactor.core.publisher.Mono;

import java.security.Principal;

import org.springframework.cloud.gateway.filter.ratelimit.KeyResolver;
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
import org.springframework.web.server.ServerWebExchange;

import org.springframework.core.convert.converter.Converter;

@Configuration
@EnableWebFluxSecurity
@EnableConfigurationProperties({GatewayAuthProperties.class, GatewayCsrfProperties.class})
public class GatewaySecurityConfig {

    @Bean
    SecurityWebFilterChain securityWebFilterChain(
            ServerHttpSecurity http,
            ServerAuthenticationConverter bearerTokenConverter,
            Converter<Jwt, Mono<AbstractAuthenticationToken>> jwtAuthenticationConverter) {
        http
                .csrf(ServerHttpSecurity.CsrfSpec::disable)
                .authorizeExchange(auth -> auth
                        .pathMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .pathMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                        .pathMatchers("/.well-known/**", "/actuator/health").permitAll()
                        .pathMatchers("/api/admin/**").hasRole("SUPER_ADMIN")
                        .pathMatchers(HttpMethod.POST, "/api/reservations").hasRole("SINH_VIEN")
                        .pathMatchers(HttpMethod.GET, "/api/reservations/me").hasRole("SINH_VIEN")
                        .pathMatchers(HttpMethod.GET, "/api/reservations/pending").hasRole("ORGANIZER")
                        .pathMatchers(HttpMethod.GET, "/api/reservations").hasRole("ORGANIZER")
                        .pathMatchers(HttpMethod.PATCH, "/api/reservations/*/approve").hasRole("ORGANIZER")
                        .pathMatchers(HttpMethod.PATCH, "/api/reservations/*/reject").hasRole("ORGANIZER")
                        .pathMatchers(HttpMethod.POST, "/api/reservations/*/approve").hasRole("ORGANIZER")
                        .pathMatchers(HttpMethod.POST, "/api/reservations/*/reject").hasRole("ORGANIZER")
                        .pathMatchers(HttpMethod.POST, "/api/tickets/inventories")
                        .hasAnyRole("ORGANIZER", "SUPER_ADMIN")
                        .pathMatchers(HttpMethod.GET, "/api/ticketing/events/*/availability",
                                "/api/ticketing/events/availability").permitAll()
                        .pathMatchers(HttpMethod.GET, "/api/ticketing/stats").hasRole("SUPER_ADMIN")
                        .pathMatchers("/api/ticketing/**").hasRole("ORGANIZER")
                        .pathMatchers("/api/tickets/**", "/api/reservations/**").authenticated()
                        .pathMatchers(HttpMethod.GET, "/api/events/stats").hasRole("SUPER_ADMIN")
                        .pathMatchers(HttpMethod.GET, "/api/events/**").permitAll()
                        .pathMatchers("/api/events/**").hasRole("ORGANIZER")
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

    @Bean
    KeyResolver clientKeyResolver() {
        return exchange -> exchange.getPrincipal()
                .map(Principal::getName)
                .filter(StringUtils::hasText)
                .map(name -> "principal:" + name)
                .switchIfEmpty(Mono.fromSupplier(() -> clientAddressKey(exchange)));
    }

    private String clientAddressKey(ServerWebExchange exchange) {
        var forwardedFor = exchange.getRequest().getHeaders().getFirst("X-Forwarded-For");
        if (StringUtils.hasText(forwardedFor)) {
            var clientIp = forwardedFor.split(",", 2)[0].trim();
            if (StringUtils.hasText(clientIp)) {
                return "ip:" + clientIp;
            }
        }

        var remoteAddress = exchange.getRequest().getRemoteAddress();
        if (remoteAddress == null) {
            return "anonymous";
        }
        if (remoteAddress.getAddress() != null) {
            return "ip:" + remoteAddress.getAddress().getHostAddress();
        }
        if (StringUtils.hasText(remoteAddress.getHostString())) {
            return "ip:" + remoteAddress.getHostString();
        }
        return "anonymous";
    }
}
