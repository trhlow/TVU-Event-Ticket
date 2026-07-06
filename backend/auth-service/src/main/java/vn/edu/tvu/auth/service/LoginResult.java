package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.dto.response.AuthProfileResponse;
import vn.edu.tvu.auth.security.JwtToken;

public record LoginResult(AuthProfileResponse profile, JwtToken jwt, String csrfToken) {
}
