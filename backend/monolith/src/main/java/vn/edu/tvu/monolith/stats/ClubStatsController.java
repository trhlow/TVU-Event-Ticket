package vn.edu.tvu.monolith.stats;

import vn.edu.tvu.shared.web.PageResponse;
import vn.edu.tvu.shared.web.PageableFactory;

import java.util.Map;
import java.util.UUID;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Read-only cross-club statistics for super-admin. A super-admin administers club accounts and reads
 * data; it never acts inside a club's scope, so there is no write endpoint here by design.
 *
 * <p>Authorisation is declared here and in {@code SecurityConfig}. The matcher keeps the rule where
 * every other route's rule lives; the annotation survives anyone rewriting the matcher list.
 */
@RestController
@PreAuthorize("hasRole('SUPER_ADMIN')")
@Tag(name = "Admin statistics", description = "Per-club activity figures for super-admin")
public class ClubStatsController {

    /**
     * Sortable by club attributes only. Paging is driven by the club list, so sorting by a computed
     * figure such as "most tickets issued" would require paging the aggregates instead — see the spec.
     */
    private static final Map<String, String> SORT_FIELDS = Map.of(
            "name", "name",
            "createdAt", "createdAt");

    private static final String DEFAULT_SORT = "name,asc";

    private final ClubStatsService service;

    public ClubStatsController(ClubStatsService service) {
        this.service = service;
    }

    @GetMapping("/api/admin/clubs/stats")
    @Operation(summary = "List clubs with their event, ticket and organizer totals")
    public PageResponse<ClubStatsSummary> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort) {
        return PageResponse.from(
                service.summaries(PageableFactory.of(page, size, sort, SORT_FIELDS, DEFAULT_SORT)));
    }

    @GetMapping("/api/admin/clubs/{clubId}/stats")
    @Operation(summary = "Get one club's totals plus its 30-day daily activity series")
    public ClubStatsDetail detail(@PathVariable UUID clubId) {
        return service.detail(clubId);
    }
}
