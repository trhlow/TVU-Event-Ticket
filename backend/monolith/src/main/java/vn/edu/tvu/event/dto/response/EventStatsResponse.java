package vn.edu.tvu.event.dto.response;

import vn.edu.tvu.event.domain.EventStatus;

import java.util.Map;

public record EventStatsResponse(long totalEvents, Map<EventStatus, Long> eventsByStatus) {
}
