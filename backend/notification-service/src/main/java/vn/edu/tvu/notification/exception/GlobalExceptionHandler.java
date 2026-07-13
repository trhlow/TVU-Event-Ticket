package vn.edu.tvu.notification.exception;

import jakarta.servlet.http.HttpServletRequest;

import java.time.Instant;
import java.util.LinkedHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErrorResponse> handleValidation(
            MethodArgumentNotValidException exception,
            HttpServletRequest request) {
        var fieldErrors = new LinkedHashMap<String, String>();
        exception.getBindingResult().getFieldErrors().forEach(error ->
                fieldErrors.putIfAbsent(error.getField(), error.getDefaultMessage()));
        return response(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Request validation failed",
                request.getRequestURI(), fieldErrors);
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ErrorResponse> handleStatus(ResponseStatusException exception, HttpServletRequest request) {
        var status = HttpStatus.valueOf(exception.getStatusCode().value());
        return response(status, "REQUEST_REJECTED", exception.getReason(), request.getRequestURI(), null);
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorResponse> handleUnexpected(Exception exception, HttpServletRequest request) {
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Unexpected server error",
                request.getRequestURI(), null);
    }

    private ResponseEntity<ErrorResponse> response(
            HttpStatus status,
            String code,
            String message,
            String path,
            java.util.Map<String, String> fieldErrors) {
        return ResponseEntity.status(status)
                .body(new ErrorResponse(Instant.now(), status.value(), code, message, path, fieldErrors));
    }
}
