package vn.edu.tvu.ticket.controller;

import vn.edu.tvu.ticket.dto.request.InitializeTicketInventoryRequest;
import vn.edu.tvu.ticket.dto.response.TicketInventoryResponse;
import vn.edu.tvu.ticket.security.CurrentUser;
import vn.edu.tvu.ticket.service.TicketReservationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tickets/inventories")
@Tag(name = "Ticket inventory", description = "Event ticket counter snapshots owned by ticket-service")
public class TicketInventoryController {

    private final TicketReservationService service;

    public TicketInventoryController(TicketReservationService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Initialize ticket-service inventory for an event")
    public TicketInventoryResponse initialize(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody InitializeTicketInventoryRequest request) {
        return service.initializeInventory(CurrentUser.from(jwt), request);
    }
}
