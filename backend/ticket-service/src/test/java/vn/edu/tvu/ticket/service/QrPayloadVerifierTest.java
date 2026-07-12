package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.config.QrSigningProperties;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QrPayloadVerifierTest {

    private static final String SECRET = "test-qr-signing-secret-with-32-characters";
    private final QrPayloadVerifier verifier = new QrPayloadVerifier(new QrSigningProperties(SECRET));

    @Test
    void verifiesValidPayload() throws Exception {
        var ticketId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        var expiresAt = Instant.now().plusSeconds(60);

        var result = verifier.verify(sign(ticketId, eventId, expiresAt));

        assertThat(result.ticketId()).isEqualTo(ticketId);
        assertThat(result.eventId()).isEqualTo(eventId);
    }

    @Test
    void rejectsBadSignatureMalformedAndExpiredPayloads() throws Exception {
        var ticketId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        var valid = sign(ticketId, eventId, Instant.now().plusSeconds(60));

        assertThatThrownBy(() -> verifier.verify(valid.substring(0, valid.length() - 1) + "0"))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> verifier.verify("not-a-qr"))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> verifier.verify(sign(ticketId, eventId, Instant.now().minusSeconds(1))))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("expired");
    }

    private String sign(UUID ticketId, UUID eventId, Instant expiresAt) throws Exception {
        var unsigned = ticketId + ":" + eventId + ":" + expiresAt.getEpochSecond();
        var mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return unsigned + ":" + HexFormat.of().formatHex(mac.doFinal(unsigned.getBytes(StandardCharsets.UTF_8)));
    }
}
