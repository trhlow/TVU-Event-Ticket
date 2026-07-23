package vn.edu.tvu.auth.security;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.jwt.Jwt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RevokedTokenValidatorTest {

    @Mock TokenRevocationService revocationService;

    @Test
    void failsWhenSubjectIsRevoked() {
        var subject = UUID.randomUUID().toString();
        when(revocationService.isRevoked(subject)).thenReturn(true);

        var result = new RevokedTokenValidator(revocationService).validate(jwt(subject));

        assertThat(result.hasErrors()).isTrue();
        assertThat(result.getErrors()).anyMatch(error -> "token_revoked".equals(error.getErrorCode()));
    }

    @Test
    void succeedsWhenSubjectIsNotRevoked() {
        var subject = UUID.randomUUID().toString();
        when(revocationService.isRevoked(subject)).thenReturn(false);

        var result = new RevokedTokenValidator(revocationService).validate(jwt(subject));

        assertThat(result.hasErrors()).isFalse();
    }

    private Jwt jwt(String subject) {
        return Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(subject)
                .build();
    }
}
