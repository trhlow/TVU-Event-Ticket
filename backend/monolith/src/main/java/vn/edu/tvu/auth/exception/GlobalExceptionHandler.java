package vn.edu.tvu.auth.exception;

import vn.edu.tvu.shared.web.ErrorResponse;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataIntegrityViolationException;
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
        return build(HttpStatus.CONFLICT, "DATA_INTEGRITY_CONFLICT",
                "The record is still referenced by other data and cannot be modified", request, null);
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
