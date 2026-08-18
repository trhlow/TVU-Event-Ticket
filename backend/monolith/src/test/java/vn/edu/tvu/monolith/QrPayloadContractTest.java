package vn.edu.tvu.monolith;

import vn.edu.tvu.notification.config.NotificationQrProperties;
import vn.edu.tvu.notification.service.QrSigner;
import vn.edu.tvu.ticket.config.QrSigningProperties;
import vn.edu.tvu.ticket.service.QrPayloadVerifier;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;

import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The QR payload format is written down in two modules that never call each other: notification
 * signs ({@link QrSigner}, reached from the approval mail worker) and ticket verifies
 * ({@link QrPayloadVerifier}, reached from POST /api/ticketing/check-in).
 *
 * <p>Until this class existed, each side was tested only against a private reimplementation of the
 * other -- {@code QrSignerTest.verifyTicketContract} hand-rolls the verifier and
 * {@code QrPayloadVerifierTest.sign} hand-rolls the signer. Four statements of one format, and no
 * test crossing the boundary. Reordering the fields, adding one, or changing the separator on
 * either side left every backend suite green and would have been discovered by an organizer
 * holding a scanner at the door, with a queue in front of them and nothing to fall back on: the
 * payload is generated only while the mail is being sent, so it is not stored anywhere and cannot
 * be reissued or checked in by hand.
 *
 * <p>These tests therefore use the real classes on both sides. No mocks and no local copy of the
 * format -- a copy here would rebuild exactly the hole this class closes.
 */
class QrPayloadContractTest {

    /** One secret for both halves, which is what production does -- see the third test. */
    private static final String SECRET = "contract-test-qr-secret-with-32-characters";

    private final QrSigner signer = new QrSigner(new NotificationQrProperties(SECRET));
    private final QrPayloadVerifier verifier = new QrPayloadVerifier(new QrSigningProperties(SECRET));

    @Test
    @DisplayName("The QR fetched from the fallback endpoint is byte-for-byte the one that was emailed")
    void theFallbackPayloadIsIdenticalToTheEmailedOne() {
        var ticketId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        var endsAt = Instant.now().plusSeconds(7200);

        var emailed = signer.create(ticketId, eventId, endsAt).payload();
        // What TicketQrService does, through the same shared format it uses.
        var fetched = vn.edu.tvu.shared.qr.QrPayloadFormat.sign(ticketId, eventId, endsAt,
                SECRET.getBytes(java.nio.charset.StandardCharsets.UTF_8));

        // Equality, not merely "both verify". A student who finds the email after using the
        // fallback page must not be holding two different codes for one seat, and an organizer
        // comparing a screenshot against the inbox must see the same string.
        assertThat(fetched).isEqualTo(emailed);
    }

    @Test
    @DisplayName("A payload the notification module signs is accepted by the ticket module")
    void signedPayloadIsAcceptedByTheVerifier() {
        var ticketId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        var expiresAt = Instant.now().plusSeconds(3600);

        var verified = verifier.verify(signer.create(ticketId, eventId, expiresAt).payload());

        assertThat(verified.ticketId()).isEqualTo(ticketId);
        assertThat(verified.eventId()).isEqualTo(eventId);
        assertThat(verified.expiresAt()).isEqualTo(Instant.ofEpochSecond(expiresAt.getEpochSecond()));
    }

    @Test
    @DisplayName("The QR image emailed to the student decodes to a payload check-in accepts")
    void qrImageContentIsAcceptedByTheVerifier() throws Exception {
        var ticketId = UUID.randomUUID();
        var eventId = UUID.randomUUID();

        // The PNG, not the payload string: this is the only artefact a student ever receives, and
        // scanning it is the only way a ticket is redeemed. Asserting on the string alone would
        // leave the encode/decode step -- the one an organizer's camera actually performs --
        // untested end to end.
        var signedQr = signer.create(ticketId, eventId, Instant.now().plusSeconds(3600));
        var scanned = decodeQrImage(signedQr.png());

        var verified = verifier.verify(scanned);

        assertThat(verified.ticketId()).isEqualTo(ticketId);
        assertThat(verified.eventId()).isEqualTo(eventId);
    }

    @Test
    @DisplayName("Both modules' QR secret properties resolve from one environment variable")
    void bothModulesReadTheSameQrSecret() {
        // The round-trip tests above hand both halves the same secret because that is what the
        // configuration is supposed to do. This is what checks that it still does.
        //
        // The two prefixes are independent -- tvu.notification.qr.signing-secret and
        // tvu.ticket.qr.secret -- so nothing but this test stops one of them from being pointed at
        // a different variable, or a new profile from setting only one. The consequence is not a
        // startup failure: both halves would start, and every ticket would fail verification at
        // the door with "QR code is invalid".
        //
        // Compared unresolved, as the placeholder text. Resolving them here would compare two
        // copies of whatever this machine happens to have in its environment -- equal even when
        // the two keys name different variables, which is the whole failure being excluded.
        for (var resource : List.of("application.yml", "application-prod.yml")) {
            var signing = rawProperty(resource, "tvu.notification.qr.signing-secret");
            var verifying = rawProperty(resource, "tvu.ticket.qr.secret");

            assertThat(signing)
                    .as("%s must set the notification module's QR signing secret", resource)
                    .isNotNull();
            assertThat(verifying)
                    .as("%s must set the ticket module's QR verification secret", resource)
                    .isNotNull();
            assertThat(verifying)
                    .as("in %s the ticket module verifies with a different secret than the "
                            + "notification module signs with, so every QR code would be rejected "
                            + "at check-in", resource)
                    .isEqualTo(signing);
        }
    }

    private String decodeQrImage(byte[] png) throws Exception {
        var image = ImageIO.read(new ByteArrayInputStream(png));
        var bitmap = new BinaryBitmap(new HybridBinarizer(new BufferedImageLuminanceSource(image)));
        return new MultiFormatReader().decode(bitmap).getText();
    }

    /**
     * Reads a key out of a YAML resource without resolving placeholders. A file may load as several
     * property sources (one per {@code ---} document), so every one is searched.
     */
    private String rawProperty(String resourceName, String key) {
        List<PropertySource<?>> sources;
        try {
            sources = new YamlPropertySourceLoader().load(resourceName, new ClassPathResource(resourceName));
        } catch (Exception ex) {
            throw new IllegalStateException("Could not read " + resourceName, ex);
        }
        return sources.stream()
                .map(source -> source.getProperty(key))
                .filter(java.util.Objects::nonNull)
                .map(Object::toString)
                .findFirst()
                .orElse(null);
    }
}
