package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.shared.domain.UserRole;
import vn.edu.tvu.auth.dto.request.LoginRequest;
import vn.edu.tvu.auth.dto.request.UpdateProfileRequest;
import vn.edu.tvu.auth.identity.ExternalIdentity;
import vn.edu.tvu.auth.identity.IdentityProvider;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.auth.security.CsrfProperties;
import vn.edu.tvu.auth.security.CsrfTokenService;
import vn.edu.tvu.auth.security.JwtProperties;
import vn.edu.tvu.auth.security.RsaKeyManager;

import java.time.Duration;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthApplicationServiceTest {

    @Mock
    private IdentityProvider identityProvider;

    @Mock
    private UserRepository userRepository;

    private RsaKeyManager keyManager;
    private CsrfTokenService csrfTokenService;
    private AuthApplicationService service;

    @BeforeEach
    void setUp() {
        var jwtProperties = new JwtProperties(
                "http://localhost:8084",
                Duration.ofMinutes(15),
                "test-key",
                null,
                null);
        keyManager = RsaKeyManager.generate(jwtProperties.keyId());
        var jwtService = new InternalJwtService(jwtProperties, keyManager);
        csrfTokenService = new CsrfTokenService(new CsrfProperties("dev-csrf-test-secret"));
        service = new AuthApplicationService(
                identityProvider,
                userRepository,
                new SessionMinter(jwtService, csrfTokenService));
    }

    @Test
    void login_doesNotClaimAnAdminAccountThatSharesTheEmail() {
        // An Entra login presenting a club account's address must create a brand-new student and leave the
        // club account untouched. The stub is lenient because the fixed code never consults it: matching by
        // subject only is exactly what closes the takeover path.
        var club = new Club("CLB Tin hoc", "Hoc thuat CNTT");
        ReflectionTestUtils.setField(club, "id", UUID.randomUUID());
        var clubAccount = persisted(
                User.emailOtpOrganizer("clbtinhoc@tvu.edu.vn", "CLB Tin hoc", club), UUID.randomUUID());
        when(identityProvider.verify("token"))
                .thenReturn(new ExternalIdentity("entra:attacker", "clbtinhoc@tvu.edu.vn", "Nguoi La"));
        when(userRepository.findByExtSubject("entra:attacker")).thenReturn(Optional.empty());
        lenient().when(userRepository.findByEmail("clbtinhoc@tvu.edu.vn")).thenReturn(Optional.of(clubAccount));
        when(userRepository.save(any(User.class)))
                .thenAnswer(invocation -> persisted(invocation.getArgument(0), UUID.randomUUID()));

        var result = service.login(new LoginRequest("token", null));

        assertThat(result.profile().role()).isEqualTo(UserRole.SINH_VIEN);
        assertThat(clubAccount.getRole()).isEqualTo(UserRole.ORGANIZER);
        assertThat(clubAccount.getExtSubject()).isNull();
    }

    @Test
    void login_createsStudentAndReturnsJwtBoundCsrfToken() {
        var userId = UUID.randomUUID();
        when(identityProvider.verify("student@example.com"))
                .thenReturn(new ExternalIdentity("dev:student@example.com", "student@example.com", "Student"));
        when(userRepository.findByExtSubject("dev:student@example.com")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> persisted(invocation.getArgument(0), userId));

        var result = service.login(new LoginRequest("student@example.com", null));

        var decoded = NimbusJwtDecoder.withPublicKey(keyManager.publicKey()).build().decode(result.jwt().value());
        assertThat(result.profile().id()).isEqualTo(userId);
        assertThat(result.profile().email()).isEqualTo("student@example.com");
        assertThat(result.profile().role()).isEqualTo(UserRole.SINH_VIEN);
        assertThat(result.profile().profileComplete()).isFalse();
        assertThat(decoded.getSubject()).isEqualTo(userId.toString());
        assertThat(decoded.getClaimAsStringList("roles")).containsExactly("SINH_VIEN");
        assertThat(result.csrfToken()).isEqualTo(csrfTokenService.sign(result.jwt().jti(), result.jwt().expiresAt()));
    }

    @Test
    void login_matchesReturningUserBySubjectAndNeverFallsBackToEmail() {
        var userId = UUID.randomUUID();
        var student = persisted(User.student("entra:stable-subject", "student@example.com", "Student"), userId);
        when(identityProvider.verify("student@example.com"))
                .thenReturn(new ExternalIdentity("entra:stable-subject", "student@example.com", "Student Renamed"));
        when(userRepository.findByExtSubject("entra:stable-subject")).thenReturn(Optional.of(student));
        when(userRepository.save(student)).thenReturn(student);

        var result = service.login(new LoginRequest("student@example.com", null));

        assertThat(result.profile().id()).isEqualTo(userId);
        assertThat(student.getDisplayName()).isEqualTo("Student Renamed");
        verify(userRepository, never()).findByEmail(any());
    }

    @Test
    void login_rejectsLockedAccount() {
        var locked = persisted(User.organizer("entra:organizer-subject", "organizer@example.com", "Organizer", null),
                UUID.randomUUID());
        locked.lock();
        when(identityProvider.verify("organizer@example.com"))
                .thenReturn(new ExternalIdentity("entra:organizer-subject", "organizer@example.com", "Organizer"));
        when(userRepository.findByExtSubject("entra:organizer-subject")).thenReturn(Optional.of(locked));

        assertThatThrownBy(() -> service.login(new LoginRequest("organizer@example.com", null)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Account is locked");
    }

    @Test
    void login_rejectsOrganizerWhoseClubIsDeactivated() {
        var club = new Club("CLB Tin hoc", null);
        ReflectionTestUtils.setField(club, "id", UUID.randomUUID());
        club.deactivate();
        var organizer = persisted(
                User.organizer("entra:organizer-subject", "organizer@example.com", "Organizer", club),
                UUID.randomUUID());
        when(identityProvider.verify("organizer@example.com"))
                .thenReturn(new ExternalIdentity("entra:organizer-subject", "organizer@example.com", "Organizer"));
        when(userRepository.findByExtSubject("entra:organizer-subject")).thenReturn(Optional.of(organizer));

        assertThatThrownBy(() -> service.login(new LoginRequest("organizer@example.com", null)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Club is inactive");
        verify(userRepository, never()).save(any());
    }

    @Test
    void updateProfile_setsMssvAndReturnsTokenContainingMssv() {
        var userId = UUID.randomUUID();
        var student = persisted(User.student("dev:student@example.com", "student@example.com", "Student"), userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));
        when(userRepository.existsByMssvAndIdNot("110122001", userId)).thenReturn(false);
        when(userRepository.save(student)).thenReturn(student);

        var result = service.updateProfile(userId, new UpdateProfileRequest("110122001", "DA21CNTT"));

        var decoded = NimbusJwtDecoder.withPublicKey(keyManager.publicKey()).build().decode(result.jwt().value());
        assertThat(result.profile().profileComplete()).isTrue();
        assertThat(result.profile().mssv()).isEqualTo("110122001");
        assertThat(result.profile().classCode()).isEqualTo("DA21CNTT");
        assertThat(decoded.getClaimAsString("mssv")).isEqualTo("110122001");
    }

    @Test
    void updateProfile_rejectsDuplicateMssv() {
        var userId = UUID.randomUUID();
        when(userRepository.existsByMssvAndIdNot("110122001", userId)).thenReturn(true);

        assertThatThrownBy(() -> service.updateProfile(userId, new UpdateProfileRequest("110122001", "DA21CNTT")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("MSSV already exists");
    }

    private static User persisted(User user, UUID id) {
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }
}
