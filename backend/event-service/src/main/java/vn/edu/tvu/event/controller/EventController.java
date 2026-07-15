package vn.edu.tvu.event.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import vn.edu.tvu.event.dto.request.*;
import vn.edu.tvu.event.dto.response.EventResponse;
import vn.edu.tvu.event.security.CurrentUser;
import vn.edu.tvu.event.service.EventService;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/events")
@Tag(name = "Events", description = "Public event discovery and organizer event management")
public class EventController {
    private final EventService service;
    public EventController(EventService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "List events currently open for registration")
    public List<EventResponse> listPublic() { return service.listPublic(); }

    @GetMapping("/{eventId}")
    @Operation(summary = "Get an open event")
    public EventResponse getPublic(@PathVariable UUID eventId) { return service.getPublic(eventId); }

    @GetMapping("/mine")
    @Operation(summary = "List events owned by the organizer's club")
    public List<EventResponse> listOwned(@AuthenticationPrincipal Jwt jwt) {
        return service.listOwned(CurrentUser.from(jwt));
    }

    @GetMapping("/stats")
    @Operation(summary = "Get school-wide event totals by status")
    public vn.edu.tvu.event.dto.response.EventStatsResponse stats() {
        return service.stats();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a draft event")
    public EventResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody EventRequest request) {
        return service.create(CurrentUser.from(jwt), request);
    }

    @PutMapping("/{eventId}")
    @Operation(summary = "Update an event owned by the organizer's club")
    public EventResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID eventId,
                                @Valid @RequestBody EventRequest request) {
        return service.update(CurrentUser.from(jwt), eventId, request);
    }

    @PatchMapping("/{eventId}/status")
    @Operation(summary = "Move an event from DRAFT to OPEN or OPEN to CLOSED")
    public EventResponse changeStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID eventId,
                                      @Valid @RequestBody ChangeEventStatusRequest request) {
        return service.changeStatus(CurrentUser.from(jwt), eventId, request.status());
    }

    @DeleteMapping("/{eventId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a draft event owned by the organizer's club")
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID eventId) {
        service.delete(CurrentUser.from(jwt), eventId);
    }
}
