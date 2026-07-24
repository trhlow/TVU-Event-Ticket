package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.AuthMethod;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.otp.OtpCodeIssuer;
import vn.edu.tvu.auth.otp.OtpMailSender;
import vn.edu.tvu.auth.otp.OtpStore;
import vn.edu.tvu.auth.repository.UserRepository;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminOtpServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private OtpCodeIssuer otpCodeIssuer;

    @Mock
    private OtpStore otpStore;

    @Mock
    private OtpMailSender mailSender;

    @Mock
    private SessionMinter sessionMinter;

    @InjectMocks
    private AdminOtpService service;

    @Test
    void requestCode_sendsNothingForAStudentAddress() {
        when(userRepository.findByEmailAndAuthMethod("student@tvu.edu.vn", AuthMethod.EMAIL_OTP))
                .thenReturn(Optional.empty());

        service.requestCode("student@tvu.edu.vn");

        verify(mailSender, never()).sendCode(any(), any());
        verify(otpStore, never()).save(any(), any());
    }

    @Test
    void verify_rejectsALockedAccountWithoutSayingSo() {
        var admin = User.emailOtpSuperAdmin("admin@tvu.edu.vn", "Admin");
        admin.lock();
        when(userRepository.findByEmailAndAuthMethod("admin@tvu.edu.vn", AuthMethod.EMAIL_OTP))
                .thenReturn(Optional.of(admin));

        assertThatThrownBy(() -> service.verify("admin@tvu.edu.vn", "123456"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("401");
    }
}
