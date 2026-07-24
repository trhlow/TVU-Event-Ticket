package vn.edu.tvu.monolith.stats;

import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.repository.ClubMemberCount;
import vn.edu.tvu.auth.repository.ClubRepository;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.event.domain.EventStatus;
import vn.edu.tvu.event.repository.ClubEventCount;
import vn.edu.tvu.event.repository.EventRepository;
import vn.edu.tvu.ticket.repository.ClubTicketTotals;
import vn.edu.tvu.ticket.repository.DailyCount;
import vn.edu.tvu.ticket.repository.TicketRepository;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Composes per-club figures that live in three different feature modules.
 *
 * <p>This sits in {@code monolith} rather than in {@code auth} on purpose: putting it in auth would make
 * that module depend on event and ticket, a direction the module split deliberately avoids.
 * {@code vn.edu.tvu.monolith} is the application composition root and already hosts cross-cutting
 * components.
 *
 * <p>Paging is driven by the club list, never by the aggregates: one page of clubs, then three
 * {@code group by club_id} queries scoped to that page's ids. Four queries per request regardless of
 * page size.
 */
@Service
public class ClubStatsService {

    static final int SERIES_DAYS = 30;

    private final ClubRepository clubRepository;
    private final EventRepository eventRepository;
    private final TicketRepository ticketRepository;
    private final UserRepository userRepository;
    private final Clock clock;

    public ClubStatsService(ClubRepository clubRepository, EventRepository eventRepository,
            TicketRepository ticketRepository, UserRepository userRepository, Clock clock) {
        this.clubRepository = clubRepository;
        this.eventRepository = eventRepository;
        this.ticketRepository = ticketRepository;
        this.userRepository = userRepository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Page<ClubStatsSummary> summaries(Pageable pageable) {
        var clubs = clubRepository.findAll(pageable);
        var summaries = summarise(clubs.getContent());
        return clubs.map(club -> summaries.get(club.getId()));
    }

    @Transactional(readOnly = true)
    public ClubStatsDetail detail(UUID clubId) {
        var club = clubRepository.findById(clubId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
        var summary = summarise(List.of(club)).get(clubId);
        // One window value for both series: computing `now` twice could straddle midnight and offset the
        // two lines by a day.
        var today = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
        var from = today.minusDays(SERIES_DAYS - 1L).atStartOfDay(ZoneOffset.UTC).toInstant();
        var issued = byDay(ticketRepository.issuedPerDay(clubId, from));
        var checkedIn = byDay(ticketRepository.checkedInPerDay(clubId, from));

        var points = new ArrayList<DailyPoint>(SERIES_DAYS);
        for (var offset = SERIES_DAYS - 1; offset >= 0; offset--) {
            var day = today.minusDays(offset);
            points.add(new DailyPoint(day,
                    issued.getOrDefault(day, 0L),
                    checkedIn.getOrDefault(day, 0L)));
        }
        return new ClubStatsDetail(summary, List.copyOf(points));
    }

    private Map<UUID, ClubStatsSummary> summarise(List<Club> clubs) {
        var clubIds = clubs.stream().map(Club::getId).toList();
        if (clubIds.isEmpty()) {
            return Map.of();
        }
        var eventCounts = groupEvents(eventRepository.countByClubAndStatus(clubIds));
        var ticketTotals = ticketRepository.totalsByClub(clubIds).stream()
                .collect(Collectors.toMap(ClubTicketTotals::getClubId, Function.identity()));
        var organizers = userRepository.countOrganizersByClub(clubIds).stream()
                .collect(Collectors.toMap(ClubMemberCount::getClubId, ClubMemberCount::getTotal));

        return clubs.stream().collect(Collectors.toMap(Club::getId, club -> {
            var byStatus = allStatusesZeroed();
            byStatus.putAll(eventCounts.getOrDefault(club.getId(), new EnumMap<>(EventStatus.class)));
            var totals = ticketTotals.get(club.getId());
            var issued = totals == null ? 0L : totals.getIssued();
            var checkedIn = totals == null ? 0L : totals.getCheckedIn();
            return new ClubStatsSummary(
                    club.getId(),
                    club.getName(),
                    byStatus.values().stream().mapToLong(Long::longValue).sum(),
                    Map.copyOf(byStatus),
                    organizers.getOrDefault(club.getId(), 0L),
                    issued,
                    checkedIn,
                    issued == 0 ? null : (double) checkedIn / issued);
        }));
    }

    /**
     * Every status present with an explicit zero, rather than only the statuses that have rows. The two
     * sibling statistics endpoints ({@code EventService#stats}, {@code AdminManagementService#stats}) both
     * do this and are tested for it, so a client rendering a per-status chart can read
     * {@code eventsByStatus.DRAFT} and get a number from every endpoint instead of {@code undefined} from
     * this one. A brand-new club would otherwise return an empty object where the sibling shape is a full
     * map.
     */
    private EnumMap<EventStatus, Long> allStatusesZeroed() {
        var zeroed = new EnumMap<EventStatus, Long>(EventStatus.class);
        for (var status : EventStatus.values()) {
            zeroed.put(status, 0L);
        }
        return zeroed;
    }

    private Map<UUID, EnumMap<EventStatus, Long>> groupEvents(Collection<ClubEventCount> counts) {
        var grouped = new java.util.HashMap<UUID, EnumMap<EventStatus, Long>>();
        counts.forEach(count -> grouped
                .computeIfAbsent(count.getClubId(), ignored -> new EnumMap<>(EventStatus.class))
                .put(count.getStatus(), count.getTotal()));
        return grouped;
    }

    private Map<LocalDate, Long> byDay(Collection<DailyCount> counts) {
        return counts.stream().collect(Collectors.toMap(DailyCount::getDay, DailyCount::getTotal));
    }
}
