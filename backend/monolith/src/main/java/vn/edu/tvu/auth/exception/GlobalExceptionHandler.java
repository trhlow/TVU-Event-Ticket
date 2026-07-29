package vn.edu.tvu.auth.exception;

import vn.edu.tvu.shared.web.ErrorResponse;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Instant;
import java.util.List;

/**
 * Scoped to this feature's controllers. Every feature advice in this monolith declares a catch-all
 * {@code @ExceptionHandler(Exception.class)}; leaving them unscoped makes whichever one is registered
 * first (auth, per {@code MonolithApplication}'s {@code @Import} order) answer for every other
 * feature's domain exceptions with 500, silently disabling their handlers.
 *
 * <p>{@code vn.edu.tvu.monolith} is included because that package holds controllers composed across
 * features (currently the cross-club statistics endpoints) and no feature advice covers it. Without it
 * those endpoints fall through to Spring Boot's default error body, which carries no {@code code} field
 * — the field the frontend switches on — so a client reading {@code .code} would get {@code undefined}
 * from these routes and a stable string from every other route.
 */
@RestControllerAdvice(basePackages = {"vn.edu.tvu.auth", "vn.edu.tvu.monolith"})
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex,
                                                           HttpServletRequest request) {
        List<ErrorResponse.FieldError> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> new ErrorResponse.FieldError(fe.getField(), fe.getDefaultMessage()))
                .toList();
        return build(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request validation failed",
                request, fieldErrors);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex,
                                                              HttpServletRequest request) {
        HttpStatus status = HttpStatus.valueOf(ex.getStatusCode().value());
        return build(status, status.name(), ex.getReason(), request, null);
    }

    @ExceptionHandler({AccessDeniedException.class, AuthorizationDeniedException.class})
    public ResponseEntity<ErrorResponse> handleAccessDenied(Exception ex, HttpServletRequest request) {
        return build(HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied", request, null);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException ex,
                                                              HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                "Invalid value for parameter '" + ex.getName() + "'", request, null);
    }

    /**
     * A structural foreign key (V7) refused a delete — e.g. removing a student who still has reservations
     * or tickets. That is a conflict with existing data, not a server fault, so it must not fall through to
     * the 500 below. Actor references (events.created_by, reservations.reviewed_by) are intentionally
     * unconstrained, so deleting an organizer does not reach here.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ErrorResponse> handleDataIntegrity(DataIntegrityViolationException ex,
                                                             HttpServletRequest request) {
        var constraint = constraintNameOf(ex);

        // A duplicate address. Both spellings exist: the original UNIQUE from V1 and the
        // case-insensitive index from V9.
        if (constraint.contains("users_email_key") || constraint.contains("ux_users_email_lower")) {
            // No email address and no constraint name in the response: the caller learns that the
            // address is taken, which is unavoidable, but not which internals produced that answer.
            return build(HttpStatus.CONFLICT, "EMAIL_ALREADY_EXISTS",
                    "That email address is already in use", request, null);
        }

        // A structural foreign key (V7) refused a delete — a student who still has reservations or
        // tickets. A conflict with existing data, not a server fault.
        if (constraint.contains("fk_") || constraint.startsWith("reservations_") || constraint.startsWith("tickets_")) {
            return build(HttpStatus.CONFLICT, "DATA_INTEGRITY_CONFLICT",
                    "The record is still referenced by other data and cannot be modified", request, null);
        }

        // Everything else is a bug or corrupted data, and answering 409 hides it. A violated CHECK
        // from V13 (an impossible role/auth_method combination), a NOT NULL, an unexpected database
        // error — all used to be swallowed as "conflict", so nobody ever saw them. They are 500s,
        // and they are logged.
        log.error("Unexpected data integrity violation (constraint={})", constraint, ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "Unexpected error", request, null);
    }

    /** Digs the constraint name out of the driver-specific cause; empty when it cannot be found. */
    private static String constraintNameOf(DataIntegrityViolationException ex) {
        Throwable cause = ex;
        while (cause != null) {
            if (cause instanceof org.hibernate.exception.ConstraintViolationException hibernate
                    && hibernate.getConstraintName() != null) {
                return hibernate.getConstraintName().toLowerCase(java.util.Locale.ROOT);
            }
            cause = cause.getCause();
        }
        // Fall back to the message: better a substring match than treating an email clash as a 500.
        var message = ex.getMostSpecificCause().getMessage();
        return message == null ? "" : message.toLowerCase(java.util.Locale.ROOT);
    }

    /**
     * A concurrent writer moved the row between our read and our write (JPA {@code @Version} mismatch) — e.g.
     * an admin locking an account while that account is signing in. Losing the race is a transient conflict,
     * not a server fault: the other transaction's change stands and the client can simply retry against fresh
     * state. Surfacing 409 is what keeps login from silently reverting a lock.
     */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<ErrorResponse> handleOptimisticLock(OptimisticLockingFailureException ex,
                                                              HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, "CONCURRENT_MODIFICATION",
                "The record was modified by another request; please retry", request, null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex, HttpServletRequest request) {
        log.error("Unhandled request failure for {} {}", request.getMethod(), request.getRequestURI(), ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "An unexpected error occurred", request, null);
    }

    private ResponseEntity<ErrorResponse> build(HttpStatus status, String code, String message,
                                                HttpServletRequest request,
                                                List<ErrorResponse.FieldError> fieldErrors) {
        ErrorResponse body = new ErrorResponse(
                Instant.now(), status.value(), code, message, request.getRequestURI(), fieldErrors);
        return ResponseEntity.status(status).body(body);
    }
}
