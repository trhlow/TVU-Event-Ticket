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

    private static final String TENANT_ID = "e76c9cee-253d-47f7-bae3-a36caaa916c1";

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
                        TENANT_ID,
                        "https://login.microsoftonline.com",
                        "https://login.microsoftonline.com/common/discovery/v2.0/keys"),
                ignoredRefresh -> new JWKSet(rsaKey.toPublicJWK()));
    }

    @Test
    void verify_acceptsOrganizationAccountIssuerPattern() throws Exception {
        var token = token(TENANT_ID, "org-subject", "student@contoso.edu", "Student Org", List.of("client-id"));

        var identity = provider.verify(token);

        assertThat(identity.subject()).isEqualTo("ms:" + TENANT_ID + ":org-subject");
        assertThat(identity.email()).isEqualTo("student@contoso.edu");
        assertThat(identity.displayName()).isEqualTo("Student Org");
    }

    /**
     * The app registration is single-tenant, so Entra will not mint a token for any other directory.
     * The server must not depend on that: the registration's audience setting is cloud config that can
     * be widened at any time, and a token from another tenant is otherwise indistinguishable from a
     * valid one (real Microsoft signature, matching aud, self-consistent issuer).
     */
    @Test
    void verify_rejectsTokenFromAnotherTenant() throws Exception {
        var foreignTid = UUID.randomUUID().toString();
        var token = token(foreignTid, "org-subject", "attacker@evil.example", "Attacker", List.of("client-id"));

        assertThatThrownBy(() -> provider.verify(token))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("invalid Microsoft token tenant");
    }

    @Test
    void verify_rejectsPersonalAccountTenant() throws Exception {
        var personalTid = "9188040d-6c67-4c5b-b112-36a304b66dad";
        var token = token(personalTid, "personal-subject", "student@outlook.com", "Student Personal",
                List.of("client-id"));

        assertThatThrownBy(() -> provider.verify(token))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("invalid Microsoft token tenant");
    }

    /**
     * A blank tenant id would otherwise silently restore the pre-pinning behaviour (or NPE at the first
     * login attempt). Fail at startup instead, while the deployment is still being configured.
     */
    @Test
    void construction_rejectsBlankTenantId() {
        var properties = new MicrosoftIdentityProperties("client-id", "  ", null, null);

        assertThatThrownBy(() -> new MicrosoftIdentityProvider(properties, ignoredRefresh -> new JWKSet(rsaKey.toPublicJWK())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("tvu.auth.microsoft.tenant-id");
    }

    /**
     * {@code nbf} ("not before") is how Entra expresses a token that has been issued but is not yet valid.
     * Checking only {@code exp} accepts such a token for the whole window before it activates.
     */
    @Test
    void verify_rejectsTokenThatIsNotYetValid() throws Exception {
        var token = tokenNotYetValid(TENANT_ID, "org-subject", "student@contoso.edu");

        assertThatThrownBy(() -> provider.verify(token))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Microsoft token is not yet valid");
    }

    /**
     * Microsoft rotates signing keys. A cached JWKS that predates a rotation does not contain the new
     * {@code kid}, and if that is treated as a hard failure every login breaks until the cache expires.
     * The provider must force one refresh before giving up.
     */
    @Test
    void verify_refetchesJwksOnceWhenTheKeyIdIsUnknown() throws Exception {
        var staleSet = new JWKSet();
        var calls = new java.util.concurrent.atomic.AtomicInteger();
        var rotatingProvider = new MicrosoftIdentityProvider(
                new MicrosoftIdentityProperties("client-id", TENANT_ID, null, null),
                forceRefresh -> {
                    calls.incrementAndGet();
                    return forceRefresh ? new JWKSet(rsaKey.toPublicJWK()) : staleSet;
                });

        var identity = rotatingProvider.verify(
                token(TENANT_ID, "org-subject", "student@contoso.edu", "Student Org", List.of("client-id")));

        assertThat(identity.email()).isEqualTo("student@contoso.edu");
        assertThat(calls.get()).isEqualTo(2);
    }

    @Test
    void verify_rejectsWrongAudience() throws Exception {
        var token = token(TENANT_ID, "org-subject", "student@contoso.edu", "Student Org", List.of("other-client"));

        assertThatThrownBy(() -> provider.verify(token))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("invalid Microsoft token audience");
    }

    private String tokenNotYetValid(String tid, String subject, String email) throws Exception {
        var now = Instant.now();
        return sign(new JWTClaimsSet.Builder()
                .issuer("https://login.microsoftonline.com/" + tid + "/v2.0")
                .subject(subject)
                .audience(List.of("client-id"))
                .claim("tid", tid)
                .claim("preferred_username", email)
                .notBeforeTime(Date.from(now.plusSeconds(120)))
                .expirationTime(Date.from(now.plusSeconds(600)))
                .issueTime(Date.from(now))
                .build());
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
        return sign(claims);
    }

    private String sign(JWTClaimsSet claims) throws Exception {
        var header = new JWSHeader.Builder(JWSAlgorithm.RS256)
                .type(JOSEObjectType.JWT)
                .keyID(rsaKey.getKeyID())
                .build();
        var signed = new SignedJWT(header, claims);
        signed.sign(new RSASSASigner(rsaKey));
        return signed.serialize();
    }
}
