package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.config.QrSigningProperties;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class QrPayloadVerifier {

    private final byte[] secret;

    public QrPayloadVerifier(QrSigningProperties properties) {
        this.secret = properties.secret().getBytes(StandardCharsets.UTF_8);
    }

    public QrPayload verify(String signedPayload) {
        try {
            var parts = signedPayload.split(":", 4);
            if (parts.length != 4) {
                throw invalid();
            }
            var unsigned = String.join(":", parts[0], parts[1], parts[2]);
            var expected = sign(unsigned);
            var actual = HexFormat.of().parseHex(parts[3]);
            if (!MessageDigest.isEqual(expected, actual)) {
                throw invalid();
            }
            var payload = new QrPayload(UUID.fromString(parts[0]), UUID.fromString(parts[1]),
                    Instant.ofEpochSecond(Long.parseLong(parts[2])));
            if (!payload.expiresAt().isAfter(Instant.now())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "QR code has expired");
            }
            return payload;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw invalid();
        }
    }

    private byte[] sign(String value) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot verify QR signature", ex);
        }
    }

    private ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "QR code is invalid");
    }

    public record QrPayload(UUID ticketId, UUID eventId, Instant expiresAt) {
    }
}
