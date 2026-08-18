package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.config.NotificationQrProperties;
import vn.edu.tvu.shared.qr.QrPayloadFormat;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

import org.springframework.stereotype.Component;

/**
 * Turns an approved reservation into the QR image the student receives by email.
 *
 * <p>The payload construction moved to {@link QrPayloadFormat}; what stays here is the part that is
 * this module's own business — rendering the code as a PNG small enough to embed in a message.
 */
@Component
public class QrSigner {

    private static final int QR_IMAGE_SIZE = 300;

    private final byte[] secret;

    public QrSigner(NotificationQrProperties properties) {
        this.secret = properties.signingSecret().getBytes(StandardCharsets.UTF_8);
    }

    public SignedQr create(UUID ticketId, UUID eventId, Instant expiresAt) {
        var payload = QrPayloadFormat.sign(ticketId, eventId, expiresAt, secret);
        return new SignedQr(payload, png(payload));
    }

    private byte[] png(String payload) {
        try (var output = new ByteArrayOutputStream()) {
            BitMatrix matrix = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, QR_IMAGE_SIZE, QR_IMAGE_SIZE);
            MatrixToImageWriter.writeToStream(matrix, "PNG", output);
            return output.toByteArray();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to generate QR image", ex);
        }
    }

    public record SignedQr(String payload, byte[] png) {
    }
}
