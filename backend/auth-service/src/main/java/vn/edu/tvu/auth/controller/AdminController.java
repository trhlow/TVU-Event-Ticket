package vn.edu.tvu.auth.controller;

import vn.edu.tvu.auth.dto.request.CreateClubRequest;
import vn.edu.tvu.auth.dto.request.CreateOrganizerRequest;
import vn.edu.tvu.auth.dto.request.UpdateClubRequest;
import vn.edu.tvu.auth.dto.response.ClubResponse;
import vn.edu.tvu.auth.dto.response.OrganizerResponse;
import vn.edu.tvu.auth.service.AdminManagementService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import java.util.List;
import java.util.UUID;

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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('SUPER_ADMIN')")
@Tag(name = "Admin", description = "SUPER_ADMIN management of clubs and organizer accounts")
public class AdminController {

    private final AdminManagementService adminManagementService;

    public AdminController(AdminManagementService adminManagementService) {
        this.adminManagementService = adminManagementService;
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

    @PostMapping("/organizers/{organizerId}/reset")
    @Operation(summary = "Reset organizer external identity binding")
    public OrganizerResponse resetOrganizer(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID organizerId) {
        return adminManagementService.resetOrganizer(actorId(jwt), organizerId);
    }

    @DeleteMapping("/organizers/{organizerId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete an organizer account")
    public void deleteOrganizer(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID organizerId) {
        adminManagementService.deleteOrganizer(actorId(jwt), organizerId);
    }

    private UUID actorId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
