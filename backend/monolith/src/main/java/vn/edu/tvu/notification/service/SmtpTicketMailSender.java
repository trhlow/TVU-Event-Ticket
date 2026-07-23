package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.config.NotificationMailProperties;
import vn.edu.tvu.shared.messaging.ReservationApprovedMessage;

import java.nio.charset.StandardCharsets;

import jakarta.mail.internet.InternetAddress;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

@Component
public class SmtpTicketMailSender implements TicketMailSender {

    private final JavaMailSender mailSender;
    private final NotificationMailProperties properties;
    private final TicketEmailComposer composer;

    public SmtpTicketMailSender(
            JavaMailSender mailSender,
            NotificationMailProperties properties,
            TicketEmailComposer composer) {
        this.mailSender = mailSender;
        this.properties = properties;
        this.composer = composer;
    }

    @Override
    public void send(ReservationApprovedMessage message, QrSigner.SignedQr signedQr) {
        try {
            var mail = mailSender.createMimeMessage();
            var helper = new MimeMessageHelper(mail, MimeMessageHelper.MULTIPART_MODE_MIXED_RELATED,
                    StandardCharsets.UTF_8.name());
            var ticketEmail = composer.compose(message);
            helper.setTo(message.studentEmail());
            helper.setFrom(new InternetAddress(properties.fromAddress(), properties.fromName()));
            helper.setSubject(ticketEmail.subject());
            helper.setText(ticketEmail.html(), true);
            helper.addInline(ticketEmail.qrContentId(), new ByteArrayResource(signedQr.png()),
                    MediaType.IMAGE_PNG_VALUE);
            mailSender.send(mail);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to send ticket email", ex);
        }
    }
}
