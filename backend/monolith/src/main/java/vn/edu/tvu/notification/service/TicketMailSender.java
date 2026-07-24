package vn.edu.tvu.notification.service;

import vn.edu.tvu.shared.messaging.ReservationApprovedMessage;

public interface TicketMailSender {

    void send(ReservationApprovedMessage message, QrSigner.SignedQr signedQr);
}
