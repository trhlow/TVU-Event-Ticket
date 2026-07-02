package vn.edu.tvu.auth.exception;

import java.time.Instant;
import java.util.List;

/**
 * Consistent error body across all services (intentionally duplicated per service — layer-based,
 * no shared jar). {@code code} is a stable machine-readable string for the frontend to switch on;
 * {@code fieldErrors} is populated only for validation failures.
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
