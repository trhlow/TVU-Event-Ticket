package vn.edu.tvu.notification.service;

import vn.edu.tvu.shared.messaging.ReservationApprovedMessage;

import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

@Component
public class TicketEmailComposer {

    static final String QR_CONTENT_ID = "ticket-qr";

    public TicketEmail compose(ReservationApprovedMessage message) {
        var title = HtmlUtils.htmlEscape(message.eventTitle());
        var location = HtmlUtils.htmlEscape(message.eventLocation());
        var mssv = HtmlUtils.htmlEscape(message.studentMssv());
        var html = """
                <html><body>
                <h2>Ve su kien %s</h2>
                <p>MSSV: %s</p>
                <p>Thoi gian: %s - %s</p>
                <p>Dia diem: %s</p>
                <p>Vui long xuat trinh ma QR khi check-in.</p>
                <img src="cid:%s" alt="Ticket QR code" />
                </body></html>
                """.formatted(title, mssv, HtmlUtils.htmlEscape(message.eventStartAt()),
                HtmlUtils.htmlEscape(message.eventEndAt()), location, QR_CONTENT_ID);
        return new TicketEmail("Ve su kien: " + message.eventTitle(), html, QR_CONTENT_ID);
    }

    public record TicketEmail(String subject, String html, String qrContentId) {
    }
}
