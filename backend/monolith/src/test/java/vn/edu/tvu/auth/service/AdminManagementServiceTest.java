package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.AuditLog;
import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.domain.MssvStatus;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.shared.domain.UserRole;
import vn.edu.tvu.auth.dto.request.CreateClubRequest;
import vn.edu.tvu.auth.dto.request.CreateOrganizerRequest;
import vn.edu.tvu.auth.domain.UserStatus;
import vn.edu.tvu.auth.repository.AuditLogRepository;
import vn.edu.tvu.auth.repository.ClubRepository;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.auth.security.TokenRevocationService;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminManagementServiceTest {

    @Mock
    private ClubRepository clubRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private AuditLogRepository auditLogRepository;

    @Mock
    private TokenRevocationService tokenRevocationService;

    @Mock
    private TrustedDeviceService trustedDeviceService;

    private AdminManagementService service;

    @BeforeEach
    void setUp() {
        service = new AdminManagementService(clubRepository, userRepository,
                new AuditLogService(auditLogRepository), tokenRevocationService, trustedDeviceService);
    }

    @Test
    void lockOrganizer_locksAccountAndRevokesOutstandingTokens() {
        var organizerId = UUID.randomUUID();
        var organizer = User.organizer("entra:org", "organizer@example.com", "Organizer", null);
        ReflectionTestUtils.setField(organizer, "id", organizerId);
        when(userRepository.findById(organizerId)).thenReturn(Optional.of(organizer));

        service.lockOrganizer(UUID.randomUUID(), organizerId);

        assertThat(organizer.getStatus()).isEqualTo(UserStatus.LOCKED);
        verify(tokenRevocationService).revoke(organizerId);
    }

    @Test
    void createClub_rejectsDuplicateName() {
        when(clubRepository.existsByName("CLB Tin hoc")).thenReturn(true);

        assertThatThrownBy(() -> service.createClub(UUID.randomUUID(),
                new CreateClubRequest("CLB Tin hoc", "Hoc thuat CNTT")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Club name already exists");
    }

    @Test
    void createClub_savesClubAndLocalAudit() {
        var actorId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        when(clubRepository.existsByName("CLB Tin hoc")).thenReturn(false);
        when(clubRepository.save(any(Club.class))).thenAnswer(invocation -> persistedClub(invocation.getArgument(0),
                clubId));

        var response = service.createClub(actorId, new CreateClubRequest("CLB Tin hoc", "Hoc thuat CNTT"));

        assertThat(response.id()).isEqualTo(clubId);
        assertThat(response.name()).isEqualTo("CLB Tin hoc");
        var auditCaptor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(auditCaptor.capture());
        assertThat(auditCaptor.getValue().getActorId()).isEqualTo(actorId);
        assertThat(auditCaptor.getValue().getAction()).isEqualTo("auth.club.create");
        assertThat(auditCaptor.getValue().getTargetId()).isEqualTo(clubId);
    }

    @Test
    void createOrganizer_attachesClubAndRecordsAudit() {
        var actorId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        var organizerId = UUID.randomUUID();
        var club = persistedClub(new Club("CLB Tin hoc", "Hoc thuat CNTT"), clubId);
        when(clubRepository.findById(clubId)).thenReturn(Optional.of(club));
        when(userRepository.findByEmail("organizer@example.com")).thenReturn(Optional.empty());
        when(userRepository.save(any())).thenAnswer(invocation -> {
            var user = invocation.getArgument(0, vn.edu.tvu.auth.domain.User.class);
            ReflectionTestUtils.setField(user, "id", organizerId);
            return user;
        });

        var response = service.createOrganizer(actorId,
                new CreateOrganizerRequest("organizer@example.com", "Organizer", clubId));

        assertThat(response.id()).isEqualTo(organizerId);
        assertThat(response.role()).isEqualTo(UserRole.ORGANIZER);
        assertThat(response.clubId()).isEqualTo(clubId);
        var auditCaptor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(auditCaptor.capture());
        assertThat(auditCaptor.getValue().getAction()).isEqualTo("auth.organizer.create");
        assertThat(auditCaptor.getValue().getTargetId()).isEqualTo(organizerId);
    }

    @Test
    void createOrganizer_rejectsInactiveClub() {
        var clubId = UUID.randomUUID();
        var club = persistedClub(new Club("CLB Tin hoc", "Hoc thuat CNTT"), clubId);
        club.deactivate();
        when(userRepository.findByEmail("organizer@example.com")).thenReturn(Optional.empty());
        when(clubRepository.findById(clubId)).thenReturn(Optional.of(club));

        assertThatThrownBy(() -> service.createOrganizer(UUID.randomUUID(),
                new CreateOrganizerRequest("organizer@example.com", "Organizer", clubId)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("inactive");
        verify(userRepository, never()).save(any());
    }

    @Test
    void listUsers_mapsUsersIncludingMssvStatus() {
        var userId = UUID.randomUUID();
        var student = User.student("dev:student", "student@example.com", "Student");
        student.completeProfile("110122001", "DA21CNTT");
        ReflectionTestUtils.setField(student, "id", userId);
        when(userRepository.search(UserRole.SINH_VIEN, MssvStatus.UNVERIFIED)).thenReturn(List.of(student));

        var result = service.listUsers(UserRole.SINH_VIEN, MssvStatus.UNVERIFIED);

        assertThat(result).hasSize(1);
        assertThat(result.getFirst().id()).isEqualTo(userId);
        assertThat(result.getFirst().mssv()).isEqualTo("110122001");
        assertThat(result.getFirst().classCode()).isEqualTo("DA21CNTT");
        assertThat(result.getFirst().mssvStatus()).isEqualTo(MssvStatus.UNVERIFIED);
        assertThat(result.getFirst().role()).isEqualTo(UserRole.SINH_VIEN);
    }

    @Test
    void verifyMssv_marksUserVerifiedAndRecordsAudit() {
        var actorId = UUID.randomUUID();
        var userId = UUID.randomUUID();
        var student = User.student("dev:student", "student@example.com", "Student");
        student.completeProfile("110122001", "DA21CNTT");
        ReflectionTestUtils.setField(student, "id", userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(student));

        service.verifyMssv(actorId, userId);

        assertThat(student.getMssvStatus()).isEqualTo(MssvStatus.VERIFIED);
        var auditCaptor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(auditCaptor.capture());
        assertThat(auditCaptor.getValue().getAction()).isEqualTo("auth.user.verify-mssv");
        assertThat(auditCaptor.getValue().getTargetId()).isEqualTo(userId);
    }

    @Test
    void verifyMssv_rejectsUserWithoutMssv() {
        var userId = UUID.randomUUID();
        var organizer = User.organizer("dev:organizer", "organizer@example.com", "Organizer", null);
        ReflectionTestUtils.setField(organizer, "id", userId);
        when(userRepository.findById(userId)).thenReturn(Optional.of(organizer));

        assertThatThrownBy(() -> service.verifyMssv(UUID.randomUUID(), userId))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("no MSSV");
    }

    @Test
    void statsReturnsTotalsAndZeroFilledRoleBreakdown() {
        var auditLogService = new AuditLogService(auditLogRepository);
        var service = new AdminManagementService(clubRepository, userRepository, auditLogService,
                tokenRevocationService, trustedDeviceService);
        when(clubRepository.count()).thenReturn(4L);
        when(userRepository.count()).thenReturn(50L);
        when(userRepository.countGroupedByRole()).thenReturn(List.of(
                roleCount(UserRole.SINH_VIEN, 40L),
                roleCount(UserRole.ORGANIZER, 8L)));

        var stats = service.stats();

        assertThat(stats.totalClubs()).isEqualTo(4);
        assertThat(stats.totalUsers()).isEqualTo(50);
        assertThat(stats.usersByRole()).containsEntry(UserRole.SINH_VIEN, 40L);
        assertThat(stats.usersByRole()).containsEntry(UserRole.ORGANIZER, 8L);
        assertThat(stats.usersByRole()).containsEntry(UserRole.SUPER_ADMIN, 0L);
    }

    private UserRepository.UserRoleCountProjection roleCount(UserRole role, long count) {
        return new UserRepository.UserRoleCountProjection() {
            @Override public UserRole getRole() { return role; }
            @Override public long getCount() { return count; }
        };
    }

    private static Club persistedClub(Club club, UUID id) {
        ReflectionTestUtils.setField(club, "id", id);
        return club;
    }
}
