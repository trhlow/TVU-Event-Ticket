package vn.edu.tvu.auth.security;

import java.time.Instant;

public record JwtToken(String value, String jti, Instant expiresAt) {
}
