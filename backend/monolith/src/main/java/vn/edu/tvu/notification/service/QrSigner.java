package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.config.NotificationQrProperties;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

@Component
public class QrSigner {

    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final int QR_IMAGE_SIZE = 300;

    private final byte[] secret;

    public QrSigner(NotificationQrProperties properties) {
        this.secret = properties.signingSecret().getBytes(StandardCharsets.UTF_8);
    }

    public SignedQr create(UUID ticketId, UUID eventId, Instant expiresAt) {
        var unsigned = ticketId + ":" + eventId + ":" + expiresAt.getEpochSecond();
        var payload = unsigned + ":" + HexFormat.of().formatHex(sign(unsigned));
        return new SignedQr(payload, png(payload));
    }

    private byte[] sign(String unsignedPayload) {
        try {
            var mac = Mac.getInstance(HMAC_SHA256);
            mac.init(new SecretKeySpec(secret, HMAC_SHA256));
            return mac.doFinal(unsignedPayload.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to sign QR payload", ex);
        }
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
