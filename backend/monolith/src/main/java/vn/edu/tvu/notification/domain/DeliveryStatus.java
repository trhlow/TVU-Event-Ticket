package vn.edu.tvu.notification.domain;

/** Delivery states, mirrored by the CHECK constraint in V15. */
public enum DeliveryStatus {

    /** Claimed by a worker; the outcome is not yet known. */
    PROCESSING,

    /** The provider accepted the message, and that fact was committed. */
    DELIVERED,

    /** Failed provably before the message body was transmitted, so a retry is safe. */
    FAILED,

    /**
     * The provider may or may not have accepted it.
     *
     * <p>Only the reconciler ever writes this: a worker that dies mid-send cannot record anything,
     * so this state is always a conclusion drawn about an abandoned claim, never a self-report.
     */
    UNKNOWN
}
