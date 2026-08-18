package vn.edu.tvu.ticket.controller;

import vn.edu.tvu.ticket.dto.request.CreateReservationRequest;
import vn.edu.tvu.ticket.dto.response.ReservationResponse;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.service.TicketReservationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reservations")
@Tag(name = "Reservations", description = "Student registration and organizer approval workflow")
public class ReservationController {

    private final TicketReservationService service;

    public ReservationController(TicketReservationService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a pending reservation without deducting tickets")
    public ReservationResponse submit(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody CreateReservationRequest request) {
        return service.submit(CurrentUser.from(jwt), request, idempotencyKey);
    }

    @GetMapping("/me")
    @Operation(summary = "List current student's reservations")
    public List<ReservationResponse> mine(@AuthenticationPrincipal Jwt jwt) {
        return service.listMine(CurrentUser.from(jwt));
    }

    @GetMapping("/pending")
    @Operation(summary = "List pending reservations for organizer club")
    public List<ReservationResponse> pending(@AuthenticationPrincipal Jwt jwt) {
        return service.listPendingForOrganizer(CurrentUser.from(jwt));
    }

    // GET /api/reservations was removed. It advertised "list club reservations by status", accepted
    // exactly one status, answered 400 for every other value, and for that one value called the same
    // service method as /pending above. Nothing called it: the front end's endpoint inventory lists
    // /reservations/me and /reservations/pending and never the bare route, and no test exercised it.
    //
    // An endpoint whose parameter is a promise it does not keep is worse than no endpoint. The next
    // person to need APPROVED or REJECTED would have found a route that looks like it already does
    // that, and shipped the 400 to a user.

    @RequestMapping(path = "/{reservationId}/approve", method = {RequestMethod.POST, RequestMethod.PATCH})
    @Operation(summary = "Approve a reservation and atomically reserve a ticket")
    public ReservationResponse approve(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID reservationId) {
        return service.approve(CurrentUser.from(jwt), reservationId);
    }

    @RequestMapping(path = "/{reservationId}/reject", method = {RequestMethod.POST, RequestMethod.PATCH})
    @Operation(summary = "Reject a pending reservation")
    public ReservationResponse reject(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID reservationId) {
        return service.reject(CurrentUser.from(jwt), reservationId);
    }
}
