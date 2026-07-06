package vn.edu.tvu.auth.identity;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MicrosoftIdentityProviderTest {

    private RSAKey rsaKey;
    private MicrosoftIdentityProvider provider;

    @BeforeEach
    void setUp() throws Exception {
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        var keyPair = generator.generateKeyPair();
        rsaKey = new RSAKey.Builder((RSAPublicKey) keyPair.getPublic())
                .privateKey((RSAPrivateKey) keyPair.getPrivate())
                .keyUse(KeyUse.SIGNATURE)
                .algorithm(JWSAlgorithm.RS256)
                .keyID("microsoft-test-key")
                .build();
        provider = new MicrosoftIdentityProvider(
                new MicrosoftIdentityProperties(
                        "client-id",
                        "https://login.microsoftonline.com",
                        "https://login.microsoftonline.com/common/discovery/v2.0/keys"),
                () -> new JWKSet(rsaKey.toPublicJWK()));
    }

    @Test
    void verify_acceptsOrganizationAccountIssuerPattern() throws Exception {
        var tid = UUID.randomUUID().toString();
        var token = token(tid, "org-subject", "student@contoso.edu", "Student Org", List.of("client-id"));

        var identity = provider.verify(token);

        assertThat(identity.subject()).isEqualTo("ms:" + tid + ":org-subject");
        assertThat(identity.email()).isEqualTo("student@contoso.edu");
        assertThat(identity.displayName()).isEqualTo("Student Org");
    }

    @Test
    void verify_acceptsPersonalAccountIssuerPattern() throws Exception {
        var personalTid = "9188040d-6c67-4c5b-b112-36a304b66dad";
        var token = token(personalTid, "personal-subject", "student@outlook.com", "Student Personal",
                List.of("client-id"));

        var identity = provider.verify(token);

        assertThat(identity.subject()).isEqualTo("ms:" + personalTid + ":personal-subject");
        assertThat(identity.email()).isEqualTo("student@outlook.com");
    }

    @Test
    void verify_rejectsWrongAudience() throws Exception {
        var tid = UUID.randomUUID().toString();
        var token = token(tid, "org-subject", "student@contoso.edu", "Student Org", List.of("other-client"));

        assertThatThrownBy(() -> provider.verify(token))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("invalid Microsoft token audience");
    }

    private String token(String tid, String subject, String email, String name, List<String> audience)
            throws Exception {
        var now = Instant.now();
        var claims = new JWTClaimsSet.Builder()
                .issuer("https://login.microsoftonline.com/" + tid + "/v2.0")
                .subject(subject)
                .audience(audience)
                .claim("tid", tid)
                .claim("preferred_username", email)
                .claim("name", name)
                .expirationTime(Date.from(now.plusSeconds(300)))
                .issueTime(Date.from(now))
                .build();
        var header = new JWSHeader.Builder(JWSAlgorithm.RS256)
                .type(JOSEObjectType.JWT)
                .keyID(rsaKey.getKeyID())
                .build();
        var signed = new SignedJWT(header, claims);
        signed.sign(new RSASSASigner(rsaKey));
        return signed.serialize();
    }
}
