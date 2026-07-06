package vn.edu.tvu.auth.security;

import java.time.Duration;
import java.util.List;

import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

@Service
public class AuthCookieService {

    private final AuthCookieProperties properties;

    public AuthCookieService(AuthCookieProperties properties) {
        this.properties = properties;
    }

    public List<String> loginCookies(JwtToken jwt, String csrfToken) {
        return List.of(
                cookie(properties.jwtName(), jwt.value(), properties.maxAge(), true),
                cookie(properties.xsrfName(), csrfToken, properties.maxAge(), false));
    }

    public List<String> logoutCookies() {
        return List.of(
                cookie(properties.jwtName(), "", Duration.ZERO, true),
                cookie(properties.xsrfName(), "", Duration.ZERO, false));
    }

    private String cookie(String name, String value, Duration maxAge, boolean httpOnly) {
        return ResponseCookie.from(name, value)
                .httpOnly(httpOnly)
                .secure(properties.secure())
                .sameSite(properties.sameSite())
                .path(properties.path())
                .maxAge(maxAge)
                .build()
                .toString();
    }
}
