package vn.edu.tvu.monolith.auth;

import vn.edu.tvu.auth.security.CookieCsrfFilter;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import static org.assertj.core.api.Assertions.assertThat;

class CookieCsrfFilterTest {

    private final CookieCsrfFilter filter = new CookieCsrfFilter("test-csrf-secret");

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void allowsStateChangingRequestWithJwtBoundCsrfCookieAndHeader() throws Exception {
        var jwt = jwt("current-jti", Instant.now().plusSeconds(300));
        var token = CookieCsrfFilter.sign("test-csrf-secret", jwt.getId(), jwt.getExpiresAt());
        authenticate(jwt);
        var request = request("POST", "/api/events", token, token);
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void rejectsMissingOrMismatchedCsrfTokenForAuthenticatedBrowserRequest() throws Exception {
        var jwt = jwt("current-jti", Instant.now().plusSeconds(300));
        authenticate(jwt);
        var request = request("PATCH", "/api/auth/me/profile", "valid", "different");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertThat(chain.getRequest()).isNull();
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("CSRF_INVALID");
    }

    @Test
    void exemptsLoginAndSafeMethods() throws Exception {
        var loginChain = new MockFilterChain();
        filter.doFilter(request("POST", "/api/auth/login", null, null), new MockHttpServletResponse(), loginChain);

        var getChain = new MockFilterChain();
        filter.doFilter(request("GET", "/api/events", null, null), new MockHttpServletResponse(), getChain);

        assertThat(loginChain.getRequest()).isNotNull();
        assertThat(getChain.getRequest()).isNotNull();
    }

    @Test
    void allowsStateChangingRequestAuthenticatedWithBearerTokenInsteadOfCookie() throws Exception {
        authenticate(jwt("current-jti", Instant.now().plusSeconds(300)));
        var request = new MockHttpServletRequest("POST", "/api/reservations");
        request.addHeader("Authorization", "Bearer token");
        var chain = new MockFilterChain();

        filter.doFilter(request, new MockHttpServletResponse(), chain);

        assertThat(chain.getRequest()).isNotNull();
    }

    private MockHttpServletRequest request(String method, String path, String cookie, String header) {
        var request = new MockHttpServletRequest(method, path);
        request.setCookies(new jakarta.servlet.http.Cookie("TVU_AUTH", "jwt"));
        if (cookie != null) {
            request.setCookies(
                    new jakarta.servlet.http.Cookie("TVU_AUTH", "jwt"),
                    new jakarta.servlet.http.Cookie("XSRF-TOKEN", cookie));
        }
        if (header != null) {
            request.addHeader("X-XSRF-TOKEN", header);
        }
        return request;
    }

    private Jwt jwt(String jti, Instant expiresAt) {
        return new Jwt("token", Instant.now(), expiresAt, Map.of("alg", "RS256"),
                Map.of("sub", "user", "jti", jti));
    }

    private void authenticate(Jwt jwt) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(jwt, "N/A"));
    }
}
