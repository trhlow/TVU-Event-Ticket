package vn.edu.tvu.shared.web;

import java.time.Instant;
import java.util.List;

/**
 * The single error body every endpoint answers with. {@code code} is a stable machine-readable string
 * for the frontend to switch on; {@code fieldErrors} is populated only for validation failures.
 *
 * <p>This used to be copied once per service, on the reasoning that the services shared no jar. They
 * are one deployable now, so the copies were three chances for the wire format to drift apart without
 * anyone noticing — and one of them already had.
 */
public record ErrorResponse(
        Instant timestamp,
        int status,
        String code,
        String message,
        String path,
        List<FieldError> fieldErrors
) {
    public record FieldError(String field, String message) {}
}
