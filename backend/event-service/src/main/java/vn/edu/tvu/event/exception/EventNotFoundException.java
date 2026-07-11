package vn.edu.tvu.event.exception;

public class EventNotFoundException extends RuntimeException {
    public EventNotFoundException() { super("Event not found"); }
}
