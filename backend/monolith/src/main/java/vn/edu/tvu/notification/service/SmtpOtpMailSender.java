package vn.edu.tvu.notification.service;

import vn.edu.tvu.auth.otp.OtpMailSender;
import vn.edu.tvu.notification.config.NotificationMailProperties;

import java.nio.charset.StandardCharsets;

import jakarta.mail.internet.InternetAddress;

import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

@Component
public class SmtpOtpMailSender implements OtpMailSender {

    private final JavaMailSender mailSender;
    private final NotificationMailProperties properties;

    public SmtpOtpMailSender(JavaMailSender mailSender, NotificationMailProperties properties) {
        this.mailSender = mailSender;
        this.properties = properties;
    }

    @Override
    public void sendCode(String email, String code) {
        try {
            var mail = mailSender.createMimeMessage();
            var helper = new MimeMessageHelper(mail, false, StandardCharsets.UTF_8.name());
            helper.setTo(email);
            helper.setFrom(new InternetAddress(properties.fromAddress(), properties.fromName()));
            helper.setSubject("Mã đăng nhập TVU Events");
            helper.setText("Mã đăng nhập của bạn là " + code + ". Mã có hiệu lực trong 10 phút.", false);
            mailSender.send(mail);
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to send OTP email", ex);
        }
    }
}
