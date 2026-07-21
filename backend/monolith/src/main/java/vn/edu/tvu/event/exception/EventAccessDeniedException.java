package vn.edu.tvu.event.exception;

public class EventAccessDeniedException extends RuntimeException {
    public EventAccessDeniedException() { super("Event belongs to another club"); }
}
