package vn.edu.tvu.ticket.client;

import java.util.UUID;

import org.springframework.web.server.ResponseStatusException;

public interface EventLookup {
    /**
     * Returns a snapshot of the event if it exists and is open for the public.
     *
     * @throws ResponseStatusException with {@code 404 NOT_FOUND} when the event is unknown or not OPEN.
     *         Implementations must translate any feature-internal exception into this contract so ticket
     *         callers can rely on a single error type (e.g. the batch availability endpoint skips exactly
     *         these ids instead of failing the whole request).
     */
    EventSnapshot getOpenEvent(UUID eventId);
}
