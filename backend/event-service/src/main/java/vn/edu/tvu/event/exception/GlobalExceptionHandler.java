package vn.edu.tvu.event.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;

/**
 * Sample advice turning exceptions into a consistent {@link ErrorResponse} body. Intentionally
 * duplicated per service (no shared jar); each service extends it with its own domain exceptions.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(EventNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(EventNotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, "EVENT_NOT_FOUND", ex.getMessage(), request, null);
    }

    @ExceptionHandler(EventAccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(EventAccessDeniedException ex,
                                                             HttpServletRequest request) {
        return build(HttpStatus.FORBIDDEN, "EVENT_ACCESS_DENIED", ex.getMessage(), request, null);
    }

    @ExceptionHandler(EventConflictException.class)
    public ResponseEntity<ErrorResponse> handleConflict(EventConflictException ex, HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, "EVENT_CONFLICT", ex.getMessage(), request, null);
    }

    @ExceptionHandler(EventValidationException.class)
    public ResponseEntity<ErrorResponse> handleDomainValidation(EventValidationException ex,
                                                                 HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, "EVENT_VALIDATION_ERROR", ex.getMessage(), request, null);
    }

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

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex, HttpServletRequest request) {
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
