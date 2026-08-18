package vn.edu.tvu.ticket.dto.response;

import java.time.Instant;

/**
 * The signed check-in payload for one ticket, plus the moment it stops being accepted.
 *
 * <p>The payload is the string, not an image: the front end already draws the code itself, and
 * sending a PNG would be a bigger response the browser then has to display rather than scan.
 */
public record TicketQrResponse(String payload, Instant expiresAt) {
}
