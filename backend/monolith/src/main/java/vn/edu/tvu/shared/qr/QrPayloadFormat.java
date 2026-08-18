package vn.edu.tvu.shared.qr;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * The check-in QR payload: {@code ticketId:eventId:epochSeconds:hexHMAC}, HMAC-SHA256.
 *
 * <p>One copy of the construction, because there used to be two. {@code QrSigner} in the
 * notification module built the string and {@code QrPayloadVerifier} in the ticket module took it
 * apart, each with its own hand-written idea of the format, and each tested only against its own.
 * Every test passed while a change to either one would have printed QR codes the turnstile refused
 * — a failure nobody would see until a student was standing at the door. {@code
 * QrPayloadContractTest} was written to catch that drift; this class removes the drift instead.
 *
 * <p>Lives in {@code shared} on purpose. Notification and ticket import nothing from each other,
 * and adding the QR fallback endpoint to the ticket module must not be the change that starts.
 *
 * <p>Format only, with the integrity check that makes the format meaningful. Whether an expiry has
 * passed is policy and belongs to the caller: signing a code for an event that has ended is a
 * reasonable thing to do (a student looking at a past ticket), while accepting one at the door is
 * not.
 */
public final class QrPayloadFormat {

    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final int PART_COUNT = 4;

    private QrPayloadFormat() {
    }

    public static String sign(UUID ticketId, UUID eventId, Instant expiresAt, byte[] secret) {
        var unsigned = ticketId + ":" + eventId + ":" + expiresAt.getEpochSecond();
        return unsigned + ":" + HexFormat.of().formatHex(hmac(unsigned, secret));
    }

    /**
     * Parses a payload and checks its signature. Empty when the payload is malformed or was not
     * signed with this secret — the two are deliberately indistinguishable to the caller, because
     * telling them apart tells an attacker which half of their guess was right.
     *
     * <p>Expiry is not considered here. See the class note.
     */
    public static Optional<Parsed> parseAndVerify(String payload, byte[] secret) {
        if (payload == null) {
            return Optional.empty();
        }
        try {
            var parts = payload.split(":", PART_COUNT);
            if (parts.length != PART_COUNT) {
                return Optional.empty();
            }
            var unsigned = String.join(":", parts[0], parts[1], parts[2]);
            // Constant-time. A byte-by-byte comparison that returns early leaks, through timing,
            // how much of a forged signature was correct.
            if (!MessageDigest.isEqual(hmac(unsigned, secret), HexFormat.of().parseHex(parts[3]))) {
                return Optional.empty();
            }
            return Optional.of(new Parsed(UUID.fromString(parts[0]), UUID.fromString(parts[1]),
                    Instant.ofEpochSecond(Long.parseLong(parts[2]))));
        } catch (RuntimeException ex) {
            // A malformed UUID, a non-numeric timestamp, an odd-length hex string: all of them are
            // simply "this is not one of ours".
            return Optional.empty();
        }
    }

    private static byte[] hmac(String value, byte[] secret) {
        try {
            var mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(secret, HMAC_SHA256));
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ex) {
            // The algorithm is always present and the key is always usable, so reaching here means
            // the JVM is not what we think it is. Not a payload problem, and not recoverable.
            throw new IllegalStateException("Unable to compute the QR payload signature", ex);
        }
    }

    public record Parsed(UUID ticketId, UUID eventId, Instant expiresAt) {
    }
}
