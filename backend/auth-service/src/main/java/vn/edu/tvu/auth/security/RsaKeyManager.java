package vn.edu.tvu.auth.security;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;

import java.security.KeyFactory;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.List;
import java.util.Map;

public class RsaKeyManager {

    private final RSAKey rsaKey;

    private RsaKeyManager(RSAKey rsaKey) {
        this.rsaKey = rsaKey;
    }

    public static RsaKeyManager generate(String keyId) {
        try {
            var generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            var keyPair = generator.generateKeyPair();
            return new RsaKeyManager(new RSAKey.Builder((RSAPublicKey) keyPair.getPublic())
                    .privateKey((RSAPrivateKey) keyPair.getPrivate())
                    .keyUse(KeyUse.SIGNATURE)
                    .algorithm(JWSAlgorithm.RS256)
                    .keyID(keyId)
                    .build());
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("RSA algorithm is not available", ex);
        }
    }

    public static RsaKeyManager fromProperties(JwtProperties properties) {
        if (hasText(properties.privateKeyPem()) && hasText(properties.publicKeyPem())) {
            return fromPem(properties.keyId(), properties.privateKeyPem(), properties.publicKeyPem());
        }
        return generate(properties.keyId());
    }

    public static RsaKeyManager fromPem(String keyId, String privateKeyPem, String publicKeyPem) {
        try {
            var keyFactory = KeyFactory.getInstance("RSA");
            var privateKey = keyFactory.generatePrivate(new PKCS8EncodedKeySpec(decodePem(privateKeyPem)));
            var publicKey = keyFactory.generatePublic(new X509EncodedKeySpec(decodePem(publicKeyPem)));
            return new RsaKeyManager(new RSAKey.Builder((RSAPublicKey) publicKey)
                    .privateKey((RSAPrivateKey) privateKey)
                    .keyUse(KeyUse.SIGNATURE)
                    .algorithm(JWSAlgorithm.RS256)
                    .keyID(keyId)
                    .build());
        } catch (NoSuchAlgorithmException | InvalidKeySpecException ex) {
            throw new IllegalArgumentException("Invalid RSA key material", ex);
        }
    }

    public RSAPublicKey publicKey() {
        try {
            return rsaKey.toRSAPublicKey();
        } catch (com.nimbusds.jose.JOSEException ex) {
            throw new IllegalStateException("Unable to convert JWK to RSA public key", ex);
        }
    }

    public RSAKey jwk() {
        return rsaKey;
    }

    public JWKSet jwkSet() {
        return new JWKSet(rsaKey);
    }

    public Map<String, Object> publicJwks() {
        return Map.of("keys", List.of(rsaKey.toPublicJWK().toJSONObject()));
    }

    private static byte[] decodePem(String pem) {
        var normalized = pem
                .replace("\\n", "\n")
                .replaceAll("-----BEGIN [^-]+-----", "")
                .replaceAll("-----END [^-]+-----", "")
                .replaceAll("\\s", "");
        return Base64.getDecoder().decode(normalized);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
