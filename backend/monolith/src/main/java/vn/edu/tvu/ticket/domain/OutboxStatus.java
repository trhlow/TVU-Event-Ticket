package vn.edu.tvu.ticket.domain;

public enum OutboxStatus {
    NEW,
    PROCESSING,
    SENT,
    /**
     * Terminal. The relay exhausted its attempts and will never claim the row again. Rows in this state
     * are the alerting signal: a non-zero count means messages were dropped and need manual replay.
     */
    FAILED
}
