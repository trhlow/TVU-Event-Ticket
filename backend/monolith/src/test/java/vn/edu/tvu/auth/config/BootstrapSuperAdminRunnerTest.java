package vn.edu.tvu.auth.config;

import vn.edu.tvu.auth.domain.AuthMethod;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.shared.domain.UserRole;
import vn.edu.tvu.auth.repository.UserRepository;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.DefaultApplicationArguments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class BootstrapSuperAdminRunnerTest {

    @Test
    void run_skipsWhenNoBootstrapEmailConfigured() {
        var repository = mock(UserRepository.class);
        var runner = new BootstrapSuperAdminRunner(new BootstrapAdminProperties(null), repository);

        runner.run(new DefaultApplicationArguments());

        verifyNoInteractions(repository);
    }

    @Test
    void run_createsSuperAdminOnlyWhenEmailDoesNotExist() {
        var repository = mock(UserRepository.class);
        when(repository.findByEmail("admin@example.com"))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(User.emailOtpSuperAdmin("admin@example.com", "Bootstrap Admin")));
        var runner = new BootstrapSuperAdminRunner(new BootstrapAdminProperties(" Admin@Example.com "), repository);

        runner.run(new DefaultApplicationArguments());
        runner.run(new DefaultApplicationArguments());

        var captor = ArgumentCaptor.forClass(User.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getEmail()).isEqualTo("admin@example.com");
        assertThat(captor.getValue().getRole()).isEqualTo(UserRole.SUPER_ADMIN);
        assertThat(captor.getValue().getAuthMethod()).isEqualTo(AuthMethod.EMAIL_OTP);
        assertThat(captor.getValue().getExtSubject()).isNull();
    }
}
