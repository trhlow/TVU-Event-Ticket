package vn.edu.tvu.auth.otp;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Turns a one-time code into the value that gets stored, so the code itself never reaches Redis.
 *
 * <p>Codes used to be written in plain text. Anyone who could read Redis — a dump, an interactive
 * {@code redis-cli}, a backup, another container on the same host — could read an admin's live code
 * and sign in with it while it lasted. Admin sign-in has no password fallback, so that one string is
 * the entire door.
 *
 * <p>HMAC with a pepper, not a bare hash. A six-digit code has a million possibilities: a plain
 * SHA-256 digest is reversed by trying all of them, which takes no meaningful time. The pepper is a
 * secret the database does not contain, and it is the only thing that makes a Redis dump useless.
 *
 * <p>Rotating the pepper invalidates every code currently waiting to be used, because the stored
 * digests no longer match. That is expected, not an incident: users request a new code.
 */
public class OtpDigest {

    private static final String ALGORITHM = "HmacSHA256";

    private final SecretKeySpec key;

    public OtpDigest(String pepper) {
        if (pepper == null || pepper.isBlank()) {
            throw new IllegalArgumentException("OTP pepper must be configured");
        }
        this.key = new SecretKeySpec(pepper.getBytes(StandardCharsets.UTF_8), ALGORITHM);
    }

    /**
     * @return a Base64 digest, which never contains {@code ':'} — the character the stored value uses
     *         to separate the digest from the attempt counter.
     */
    public String of(String code) {
        try {
            var mac = Mac.getInstance(ALGORITHM);
            mac.init(key);
            return Base64.getEncoder().encodeToString(mac.doFinal(code.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to compute the OTP digest", ex);
        }
    }
}
