package vn.edu.tvu.auth.identity;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatCode;

class RestMicrosoftJwkSetClientTest {

    @Test
    void constructionDoesNotRequireABootManagedRestClientBuilder() {
        var properties = new MicrosoftIdentityProperties(
                "client-id",
                "tenant-id",
                "https://login.microsoftonline.com",
                "https://login.microsoftonline.com/common/discovery/v2.0/keys");

        assertThatCode(() -> new RestMicrosoftJwkSetClient(properties))
                .doesNotThrowAnyException();
    }
}
