package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.config.NotificationQrProperties;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

import javax.imageio.ImageIO;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class QrSignerTest {

    private static final String SECRET = "test-qr-signing-secret-with-32-characters";
    private final QrSigner signer = new QrSigner(new NotificationQrProperties(SECRET));

    @Test
    void createsTicketServiceCompatiblePayloadAndDecodablePng() throws Exception {
        var ticketId = UUID.randomUUID();
        var eventId = UUID.randomUUID();
        var expiresAt = Instant.now().plusSeconds(3600);

        var signedQr = signer.create(ticketId, eventId, expiresAt);
        var verified = verifyTicketContract(signedQr.payload());

        assertThat(verified.ticketId()).isEqualTo(ticketId);
        assertThat(verified.eventId()).isEqualTo(eventId);
        assertThat(verified.expiresAt()).isEqualTo(Instant.ofEpochSecond(expiresAt.getEpochSecond()));
        assertThat(decode(signedQr.png())).isEqualTo(signedQr.payload());
    }

    private String decode(byte[] png) throws Exception {
        var image = ImageIO.read(new ByteArrayInputStream(png));
        var bitmap = new BinaryBitmap(new HybridBinarizer(new BufferedImageLuminanceSource(image)));
        return new MultiFormatReader().decode(bitmap).getText();
    }

    private VerifiedPayload verifyTicketContract(String payload) throws Exception {
        var parts = payload.split(":", 4);
        assertThat(parts).hasSize(4);
        var unsigned = String.join(":", parts[0], parts[1], parts[2]);
        var mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        assertThat(HexFormat.of().parseHex(parts[3])).isEqualTo(mac.doFinal(unsigned.getBytes(StandardCharsets.UTF_8)));
        return new VerifiedPayload(UUID.fromString(parts[0]), UUID.fromString(parts[1]),
                Instant.ofEpochSecond(Long.parseLong(parts[2])));
    }

    private record VerifiedPayload(UUID ticketId, UUID eventId, Instant expiresAt) {
    }
}
