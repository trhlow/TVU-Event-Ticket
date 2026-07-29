package vn.edu.tvu.notification.service;

import vn.edu.tvu.notification.config.NotificationMailProperties;
import vn.edu.tvu.shared.messaging.ReservationApprovedMessage;

import java.nio.charset.StandardCharsets;

import jakarta.mail.MessagingException;
import jakarta.mail.SendFailedException;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;

import java.net.ConnectException;
import java.net.UnknownHostException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailParseException;
import org.springframework.mail.MailPreparationException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

@Component
public class SmtpTicketMailSender implements TicketMailSender {

    private static final Logger LOGGER = LoggerFactory.getLogger(SmtpTicketMailSender.class);

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
    public SendResult send(ReservationApprovedMessage message, QrSigner.SignedQr signedQr) {
        MimeMessage mail;
        try {
            // Everything in this block happens before a single byte reaches the provider, so any
            // failure here is provably retryable: a template error, a malformed address, a QR that
            // could not be attached.
            mail = mailSender.createMimeMessage();
            var helper = new MimeMessageHelper(mail, MimeMessageHelper.MULTIPART_MODE_MIXED_RELATED,
                    StandardCharsets.UTF_8.name());
            var ticketEmail = composer.compose(message);
            helper.setTo(message.studentEmail());
            helper.setFrom(new InternetAddress(properties.fromAddress(), properties.fromName()));
            helper.setSubject(ticketEmail.subject());
            helper.setText(ticketEmail.html(), true);
            helper.addInline(ticketEmail.qrContentId(), new ByteArrayResource(signedQr.png()),
                    MediaType.IMAGE_PNG_VALUE);
        } catch (Exception ex) {
            LOGGER.warn("Could not build the ticket email; nothing was sent", ex);
            return SendResult.retryable("compose failed: " + ex.getClass().getSimpleName());
        }

        try {
            mailSender.send(mail);
            return SendResult.accepted();
        } catch (MailAuthenticationException ex) {
            // Rejected at login: the conversation never got as far as a message.
            return SendResult.retryable("authentication failed");
        } catch (MailPreparationException | MailParseException ex) {
            // Spring raises these while turning the MimeMessage into bytes, still before transmission.
            return SendResult.retryable("preparation failed: " + ex.getClass().getSimpleName());
        } catch (MailSendException ex) {
            return classifySendFailure(ex);
        } catch (Exception ex) {
            // Unrecognised: assume the worst. Retrying might duplicate a ticket someone already has.
            LOGGER.error("Unclassified failure while sending a ticket email; treating as ambiguous", ex);
            return SendResult.ambiguous("unclassified: " + ex.getClass().getSimpleName());
        }
    }

    /**
     * A send failure is only retryable when it can be <em>proven</em> to have happened before the
     * message body was transmitted.
     *
     * <p>The whitelist is deliberately narrow. A connect failure means no session existed; a rejected
     * recipient means the provider refused the envelope. Anything else — most importantly a timeout
     * or a reset, which can land after the body has been accepted but before the acknowledgement
     * comes back — is ambiguous, and the safe reading is that the provider may already have it.
     */
    private SendResult classifySendFailure(MailSendException ex) {
        var causes = ex.getFailedMessages().values();
        if (causes.isEmpty()) {
            return SendResult.ambiguous("send failed with no per-message cause");
        }
        for (Exception cause : causes) {
            if (!provablyBeforeData(cause)) {
                LOGGER.warn("Ticket email may or may not have been accepted; not retrying", ex);
                return SendResult.ambiguous("send failed: " + cause.getClass().getSimpleName());
            }
        }
        return SendResult.retryable("rejected before the message body: "
                + causes.iterator().next().getClass().getSimpleName());
    }

    private boolean provablyBeforeData(Exception cause) {
        // No session was ever established, so nothing could have been transmitted.
        if (isConnectionFailure(cause)) {
            return true;
        }
        if (cause instanceof SendFailedException failed) {
            // Jakarta Mail reports which recipients the message DID reach. An empty list means the
            // provider rejected the envelope and no copy exists anywhere; a non-empty one means some
            // recipients already have it, and resending would duplicate their ticket.
            var alreadySent = failed.getValidSentAddresses();
            return alreadySent == null || alreadySent.length == 0;
        }
        if (cause instanceof MessagingException messaging) {
            return isConnectionFailure(messaging.getNextException());
        }
        return false;
    }

    private boolean isConnectionFailure(Throwable cause) {
        return cause instanceof ConnectException || cause instanceof UnknownHostException;
    }
}
