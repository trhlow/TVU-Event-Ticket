package vn.edu.tvu.auth.controller;

import vn.edu.tvu.auth.dto.request.CreateClubRequest;
import vn.edu.tvu.auth.dto.request.CreateOrganizerRequest;
import vn.edu.tvu.auth.dto.request.UpdateClubRequest;
import vn.edu.tvu.auth.domain.MssvStatus;
import vn.edu.tvu.auth.dto.response.AdminUserResponse;
import vn.edu.tvu.auth.dto.response.AuditLogResponse;
import vn.edu.tvu.auth.dto.response.ClubResponse;
import vn.edu.tvu.auth.dto.response.OrganizerResponse;
import vn.edu.tvu.shared.domain.UserRole;
import vn.edu.tvu.shared.web.PageResponse;
import vn.edu.tvu.auth.service.AdminManagementService;
import vn.edu.tvu.auth.service.AuditLogService;
import vn.edu.tvu.shared.web.PageableFactory;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('SUPER_ADMIN')")
@Tag(name = "Admin", description = "SUPER_ADMIN management of clubs and organizer accounts")
public class AdminController {

    private final AdminManagementService adminManagementService;
    private final AuditLogService auditLogService;

    public AdminController(AdminManagementService adminManagementService, AuditLogService auditLogService) {
        this.adminManagementService = adminManagementService;
        this.auditLogService = auditLogService;
    }

    @GetMapping("/stats")
    @Operation(summary = "Get school-wide club and user totals")
    public vn.edu.tvu.auth.dto.response.AdminStatsResponse stats() {
        return adminManagementService.stats();
    }

    @PostMapping("/clubs")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a club")
    public ClubResponse createClub(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateClubRequest request) {
        return adminManagementService.createClub(actorId(jwt), request);
    }

    @GetMapping("/clubs")
    @Operation(summary = "List clubs")
    public List<ClubResponse> listClubs() {
        return adminManagementService.listClubs();
    }

    @PatchMapping("/clubs/{clubId}")
    @Operation(summary = "Update a club")
    public ClubResponse updateClub(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID clubId,
            @Valid @RequestBody UpdateClubRequest request) {
        return adminManagementService.updateClub(actorId(jwt), clubId, request);
    }

    @DeleteMapping("/clubs/{clubId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Deactivate a club")
    public void deactivateClub(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID clubId) {
        adminManagementService.deactivateClub(actorId(jwt), clubId);
    }

    @PostMapping("/organizers")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create an organizer account for a club")
    public OrganizerResponse createOrganizer(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CreateOrganizerRequest request) {
        return adminManagementService.createOrganizer(actorId(jwt), request);
    }

    @GetMapping("/organizers")
    @Operation(summary = "List organizer accounts")
    public List<OrganizerResponse> listOrganizers() {
        return adminManagementService.listOrganizers();
    }

    @PatchMapping("/organizers/{organizerId}/lock")
    @Operation(summary = "Lock an organizer account")
    public OrganizerResponse lockOrganizer(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID organizerId) {
        return adminManagementService.lockOrganizer(actorId(jwt), organizerId);
    }

    @DeleteMapping("/organizers/{organizerId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete an organizer account")
    public void deleteOrganizer(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID organizerId) {
        adminManagementService.deleteOrganizer(actorId(jwt), organizerId);
    }

    @GetMapping("/users")
    @Operation(summary = "List users, optionally filtered by role and MSSV verification status")
    public List<AdminUserResponse> listUsers(
            @RequestParam(required = false) UserRole role,
            @RequestParam(required = false) MssvStatus mssvStatus) {
        return adminManagementService.listUsers(role, mssvStatus);
    }

    @PatchMapping("/users/{userId}/verify-mssv")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Verify a student's MSSV so they can reserve tickets")
    public void verifyMssv(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID userId) {
        adminManagementService.verifyMssv(actorId(jwt), userId);
    }

    @GetMapping("/audit-log")
    @Operation(summary = "Search the audit log, paginated")
    public PageResponse<AuditLogResponse> auditLog(
            @RequestParam(required = false) UUID actorId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        var pageable = PageableFactory.of(page, size, sort, AuditLogService.AUDIT_SORT_FIELDS,
                AuditLogService.DEFAULT_AUDIT_SORT);
        return auditLogService.search(actorId, action, from, to, pageable);
    }

    private UUID actorId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
