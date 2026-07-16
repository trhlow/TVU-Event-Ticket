package vn.edu.tvu.ticket.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.http.HttpMethod;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/v3/api-docs/**", "/swagger-ui/**",
                                "/swagger-ui.html").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/ticketing/events/*/availability",
                                "/api/ticketing/events/availability").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/reservations").hasRole("SINH_VIEN")
                        .requestMatchers(HttpMethod.GET, "/api/reservations/me").hasRole("SINH_VIEN")
                        .requestMatchers("/api/reservations/**", "/api/ticketing/check-in",
                                "/api/tickets/check-in", "/api/ticketing/events/*/attendees",
                                "/api/ticketing/events/*/attendees.csv").hasRole("ORGANIZER")
                        .requestMatchers(HttpMethod.GET, "/api/ticketing/dashboard/club").hasRole("ORGANIZER")
                        .requestMatchers(HttpMethod.GET, "/api/ticketing/events/*/dashboard")
                        .hasRole("ORGANIZER")
                        .requestMatchers(HttpMethod.GET, "/api/ticketing/stats").hasRole("SUPER_ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth2 -> oauth2
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));
        return http.build();
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
