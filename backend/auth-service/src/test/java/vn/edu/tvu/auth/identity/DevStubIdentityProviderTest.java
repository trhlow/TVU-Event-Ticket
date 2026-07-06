package vn.edu.tvu.auth.identity;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DevStubIdentityProviderTest {

    @Test
    void verify_usesEmailCredentialAsStableDevIdentity() {
        var provider = new DevStubIdentityProvider();

        var identity = provider.verify(" Student@Example.com ");

        assertThat(identity.subject()).isEqualTo("dev:student@example.com");
        assertThat(identity.email()).isEqualTo("student@example.com");
        assertThat(identity.displayName()).isEqualTo("Student");
    }

    @Test
    void verify_rejectsInvalidEmailCredential() {
        var provider = new DevStubIdentityProvider();

        assertThatThrownBy(() -> provider.verify("not-an-email"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("invalid dev credential");
    }
}
