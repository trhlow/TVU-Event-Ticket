package vn.edu.tvu.event.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import vn.edu.tvu.event.dto.response.EventResponse;
import vn.edu.tvu.event.service.EventService;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin/events")
@PreAuthorize("hasRole('SUPER_ADMIN')")
@Tag(name = "Admin Events", description = "SUPER_ADMIN visibility over every club's events")
public class AdminEventController {

    private final EventService service;

    public AdminEventController(EventService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "List events of every club, optionally filtered by club")
    public List<EventResponse> listAll(@RequestParam(required = false) UUID clubId) {
        return service.listAllForAdmin(clubId);
    }
}
