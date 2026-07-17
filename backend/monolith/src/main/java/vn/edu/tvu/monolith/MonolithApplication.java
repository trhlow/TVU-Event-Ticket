package vn.edu.tvu.monolith;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Import;

import vn.edu.tvu.auth.AuthServiceApplication;
import vn.edu.tvu.event.EventServiceApplication;
import vn.edu.tvu.notification.NotificationServiceApplication;
import vn.edu.tvu.ticket.TicketServiceApplication;

@SpringBootApplication
@Import({AuthServiceApplication.class, EventServiceApplication.class, TicketServiceApplication.class,
        NotificationServiceApplication.class})
public class MonolithApplication {

    public static void main(String[] args) {
        SpringApplication.run(MonolithApplication.class, args);
    }
}
