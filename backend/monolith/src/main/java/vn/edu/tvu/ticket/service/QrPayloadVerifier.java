package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.config.QrSigningProperties;
import vn.edu.tvu.shared.qr.QrPayloadFormat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * The door. Decides whether a scanned payload may be admitted.
 *
 * <p>Parsing and the signature check live in {@link QrPayloadFormat}, shared with the signer so the
 * two cannot drift. What belongs here is the policy: an expired code is a different answer to an
 * unsigned one, and the caller needs to be able to tell them apart.
 */
@Component
public class QrPayloadVerifier {

    private final byte[] secret;

    public QrPayloadVerifier(QrSigningProperties properties) {
        this.secret = properties.secret().getBytes(StandardCharsets.UTF_8);
    }

    public QrPayload verify(String signedPayload) {
        var parsed = QrPayloadFormat.parseAndVerify(signedPayload, secret).orElseThrow(this::invalid);
        if (!parsed.expiresAt().isAfter(Instant.now())) {
            // 409 rather than 400: the code is genuine and was ours. Saying so is what lets the
            // organizer tell "this student is at the wrong event" from "someone made this up".
            throw new ResponseStatusException(HttpStatus.CONFLICT, "QR code has expired");
        }
        return new QrPayload(parsed.ticketId(), parsed.eventId(), parsed.expiresAt());
    }

    private ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "QR code is invalid");
    }

    public record QrPayload(UUID ticketId, UUID eventId, Instant expiresAt) {
    }
}
