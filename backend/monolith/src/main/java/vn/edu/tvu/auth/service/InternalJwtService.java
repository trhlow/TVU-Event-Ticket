package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.security.JwtProperties;
import vn.edu.tvu.auth.security.JwtSubject;
import vn.edu.tvu.auth.security.JwtToken;
import vn.edu.tvu.auth.security.RsaKeyManager;

import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.proc.SecurityContext;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;

@Service
public class InternalJwtService {

    private final JwtProperties properties;
    private final NimbusJwtEncoder encoder;

    public InternalJwtService(JwtProperties properties, RsaKeyManager keyManager) {
        this.properties = properties;
        this.encoder = new NimbusJwtEncoder(new ImmutableJWKSet<SecurityContext>(keyManager.jwkSet()));
    }

    public JwtToken mint(JwtSubject subject) {
        var issuedAt = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        var expiresAt = issuedAt.plus(properties.ttl());
        var jti = UUID.randomUUID().toString();
        var claims = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .subject(subject.userId().toString())
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .id(jti)
                .claim("email", subject.email())
                .claim("roles", List.of(subject.role().name()));

        if (subject.clubId() != null) {
            claims.claim("club_id", subject.clubId().toString());
        }
        if (subject.mssv() != null && !subject.mssv().isBlank()) {
            claims.claim("mssv", subject.mssv());
        }
        claims.claim("mssv_verified", subject.mssvVerified());

        var header = JwsHeader.with(SignatureAlgorithm.RS256)
                .keyId(properties.keyId())
                .build();
        var jwt = encoder.encode(JwtEncoderParameters.from(header, claims.build()));
        return new JwtToken(jwt.getTokenValue(), jti, expiresAt);
    }
}
