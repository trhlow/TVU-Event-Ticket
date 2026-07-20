package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.config.NotificationMailProperties;
import vn.edu.tvu.notification.messaging.ReservationApprovedMessage;

import java.time.Instant;
import java.util.Properties;
import java.util.UUID;

import jakarta.mail.Session;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.MimeMessage;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.javamail.JavaMailSender;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SmtpTicketMailSenderTest {

    @Mock JavaMailSender javaMailSender;

    private SmtpTicketMailSender sender;

    @BeforeEach
    void setUp() {
        when(javaMailSender.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        sender = new SmtpTicketMailSender(javaMailSender,
                new NotificationMailProperties("no-reply@tvu.edu.vn", "TVU Events"), new TicketEmailComposer());
    }

    @Test
    void sendsHtmlTicketMailWithInlineQrImage() throws Exception {
        sender.send(message(), new QrSigner.SignedQr("signed-qr", new byte[] {1, 2, 3}));

        var captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(javaMailSender).send(captor.capture());
        var mail = captor.getValue();
        mail.saveChanges();

        assertThat(mail.getAllRecipients()[0].toString()).isEqualTo("student@tvu.edu.vn");
        assertThat(mail.getSubject()).contains("Open Day");
        assertThat(mail.getContentType()).contains("multipart");
        assertThat(hasInlinePart((Multipart) mail.getContent(), TicketEmailComposer.QR_CONTENT_ID)).isTrue();
    }

    private ReservationApprovedMessage message() {
        return new ReservationApprovedMessage(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "student@tvu.edu.vn", "110122001", "Open Day",
                Instant.parse("2026-07-20T09:00:00Z").toString(),
                Instant.parse("2026-07-20T11:00:00Z").toString(), "TVU Hall");
    }

    private boolean hasInlinePart(Multipart multipart, String contentId) throws Exception {
        for (int index = 0; index < multipart.getCount(); index++) {
            Part part = multipart.getBodyPart(index);
            var contentIds = part.getHeader("Content-ID");
            if (contentIds != null && ("<" + contentId + ">").equals(contentIds[0])) {
                return true;
            }
            if (part.getContent() instanceof Multipart nested && hasInlinePart(nested, contentId)) {
                return true;
            }
        }
        return false;
    }
}
