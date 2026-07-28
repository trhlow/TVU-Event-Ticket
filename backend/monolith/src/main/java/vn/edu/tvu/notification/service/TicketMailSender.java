package vn.edu.tvu.notification.service;

import vn.edu.tvu.shared.messaging.ReservationApprovedMessage;

public interface TicketMailSender {

    /**
     * Attempts to send the ticket email and reports what is known afterwards.
     *
     * <p>Returns an outcome instead of throwing, because the distinction the caller needs is not
     * "did it throw" but "is it safe to try again". Wrapping every failure in one exception — which
     * is what this interface used to do — left the worker unable to tell a compose error from a
     * connection dropped halfway through the message body, so it retried both and could send a
     * second copy of a ticket the provider had already accepted.
     */
    SendResult send(ReservationApprovedMessage message, QrSigner.SignedQr signedQr);

    /** @param detail human-readable context for the ledger and the logs; never shown to a student. */
    record SendResult(Outcome outcome, String detail) {

        public static SendResult accepted() {
            return new SendResult(Outcome.ACCEPTED, null);
        }

        public static SendResult retryable(String detail) {
            return new SendResult(Outcome.RETRYABLE_BEFORE_DATA, detail);
        }

        public static SendResult ambiguous(String detail) {
            return new SendResult(Outcome.AMBIGUOUS, detail);
        }
    }

    enum Outcome {
        /** The provider accepted the message. */
        ACCEPTED,

        /**
         * Failed provably <em>before</em> the message body was handed over, so the provider cannot
         * have a copy. Only a proven case may be classified this way — see the whitelist in
         * {@link SmtpTicketMailSender}.
         */
        RETRYABLE_BEFORE_DATA,

        /**
         * Anything else, and the default. A timeout or reset during or after the body means there is
         * no way to know whether the provider took it; retrying risks a duplicate ticket, so the
         * decision is escalated to a human instead.
         */
        AMBIGUOUS
    }
}
