package vn.edu.tvu.auth.service;

import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.domain.MssvStatus;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.shared.domain.UserRole;
import vn.edu.tvu.auth.dto.request.CreateClubRequest;
import vn.edu.tvu.auth.dto.request.CreateOrganizerRequest;
import vn.edu.tvu.auth.dto.request.UpdateClubRequest;
import vn.edu.tvu.auth.dto.response.AdminStatsResponse;
import vn.edu.tvu.auth.dto.response.AdminUserResponse;
import vn.edu.tvu.auth.dto.response.ClubResponse;
import vn.edu.tvu.auth.dto.response.OrganizerResponse;
import vn.edu.tvu.auth.repository.ClubRepository;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.auth.security.TokenRevocationService;

import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdminManagementService {

    private final ClubRepository clubRepository;
    private final UserRepository userRepository;
    private final AuditLogService auditLogService;
    private final TokenRevocationService tokenRevocationService;

    public AdminManagementService(
            ClubRepository clubRepository,
            UserRepository userRepository,
            AuditLogService auditLogService,
            TokenRevocationService tokenRevocationService) {
        this.clubRepository = clubRepository;
        this.userRepository = userRepository;
        this.auditLogService = auditLogService;
        this.tokenRevocationService = tokenRevocationService;
    }

    @Transactional(readOnly = true)
    public AdminStatsResponse stats() {
        Map<UserRole, Long> usersByRole = new EnumMap<>(UserRole.class);
        for (var role : UserRole.values()) {
            usersByRole.put(role, 0L);
        }
        userRepository.countGroupedByRole().forEach(row -> usersByRole.put(row.getRole(), row.getCount()));
        return new AdminStatsResponse(clubRepository.count(), userRepository.count(), usersByRole);
    }

    @Transactional
    public ClubResponse createClub(UUID actorId, CreateClubRequest request) {
        var name = request.name().trim();
        if (clubRepository.existsByName(name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Club name already exists");
        }
        var club = clubRepository.save(new Club(name, trimToNull(request.description())));
        auditLogService.recordAudit(actorId, "auth.club.create", "club", club.getId(),
                "{\"name\":\"" + club.getName() + "\"}");
        return clubResponse(club);
    }

    @Transactional(readOnly = true)
    public List<ClubResponse> listClubs() {
        return clubRepository.findAll().stream()
                .map(this::clubResponse)
                .toList();
    }

    @Transactional
    public ClubResponse updateClub(UUID actorId, UUID clubId, UpdateClubRequest request) {
        var club = clubRepository.findById(clubId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
        club.update(request.name().trim(), trimToNull(request.description()));
        auditLogService.recordAudit(actorId, "auth.club.update", "club", club.getId(),
                "{\"name\":\"" + club.getName() + "\"}");
        return clubResponse(club);
    }

    @Transactional
    public void deactivateClub(UUID actorId, UUID clubId) {
        var club = clubRepository.findById(clubId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
        club.deactivate();
        auditLogService.recordAudit(actorId, "auth.club.deactivate", "club", club.getId(), "{}");
    }

    @Transactional(readOnly = true)
    public List<AdminUserResponse> listUsers(UserRole role, MssvStatus mssvStatus) {
        return userRepository.search(role, mssvStatus).stream()
                .map(this::adminUserResponse)
                .toList();
    }

    private AdminUserResponse adminUserResponse(User user) {
        return new AdminUserResponse(
                user.getId(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole(),
                user.getClub() == null ? null : user.getClub().getId(),
                user.getMssv(),
                user.getClassCode(),
                user.getMssvStatus(),
                user.getStatus());
    }

    @Transactional
    public void verifyMssv(UUID actorId, UUID userId) {
        var user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
        if (user.getMssv() == null || user.getMssv().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "User has no MSSV to verify");
        }
        user.verifyMssv();
        auditLogService.recordAudit(actorId, "auth.user.verify-mssv", "user", user.getId(), "{}");
    }

    @Transactional
    public OrganizerResponse createOrganizer(UUID actorId, CreateOrganizerRequest request) {
        var email = request.email().trim().toLowerCase(Locale.ROOT);
        // Someone who signed in before being appointed already exists as a plain student. Refusing them
        // here would strand them: no other endpoint can change a role, so they could never run a club.
        var existing = userRepository.findByEmail(email);
        if (existing.isPresent() && !isUnassignedStudent(existing.get())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already exists");
        }
        var club = clubRepository.findById(request.clubId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
        if (!club.isActive()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Club is inactive");
        }
        if (existing.isPresent()) {
            var promoted = existing.get();
            promoted.promoteToOrganizer(club);
            auditLogService.recordAudit(actorId, "auth.organizer.promote", "user", promoted.getId(),
                    "{\"email\":\"" + promoted.getEmail() + "\"}");
            return organizerResponse(promoted);
        }
        var organizer = userRepository.save(
                User.organizer(User.PENDING_SUBJECT_PREFIX + email, email, request.displayName().trim(), club));
        auditLogService.recordAudit(actorId, "auth.organizer.create", "user", organizer.getId(),
                "{\"email\":\"" + organizer.getEmail() + "\"}");
        return organizerResponse(organizer);
    }

    @Transactional(readOnly = true)
    public List<OrganizerResponse> listOrganizers() {
        return userRepository.findByRole(UserRole.ORGANIZER).stream()
                .map(this::organizerResponse)
                .toList();
    }

    @Transactional
    public OrganizerResponse lockOrganizer(UUID actorId, UUID organizerId) {
        var organizer = organizer(organizerId);
        organizer.lock();
        // Locking must take effect now, not whenever the organizer's current JWT happens to expire.
        tokenRevocationService.revoke(organizer.getId());
        auditLogService.recordAudit(actorId, "auth.organizer.lock", "user", organizer.getId(), "{}");
        return organizerResponse(organizer);
    }

    @Transactional
    public OrganizerResponse resetOrganizer(UUID actorId, UUID organizerId) {
        var organizer = organizer(organizerId);
        organizer.resetExternalSubject(User.PENDING_SUBJECT_PREFIX + organizer.getEmail());
        auditLogService.recordAudit(actorId, "auth.organizer.reset", "user", organizer.getId(), "{}");
        return organizerResponse(organizer);
    }

    @Transactional
    public void deleteOrganizer(UUID actorId, UUID organizerId) {
        var organizer = organizer(organizerId);
        userRepository.delete(organizer);
        auditLogService.recordAudit(actorId, "auth.organizer.delete", "user", organizerId, "{}");
    }

    private boolean isUnassignedStudent(User user) {
        return user.getRole() == UserRole.SINH_VIEN && user.getClub() == null;
    }

    private User organizer(UUID organizerId) {
        var user = userRepository.findById(organizerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Organizer not found"));
        if (user.getRole() != UserRole.ORGANIZER) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User is not an organizer");
        }
        return user;
    }

    private ClubResponse clubResponse(Club club) {
        return new ClubResponse(club.getId(), club.getName(), club.getDescription(), club.getStatus(),
                club.getCreatedAt());
    }

    private OrganizerResponse organizerResponse(User user) {
        return new OrganizerResponse(
                user.getId(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole(),
                user.getClub() == null ? null : user.getClub().getId(),
                user.getStatus());
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
