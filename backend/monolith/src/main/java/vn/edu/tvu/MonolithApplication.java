package vn.edu.tvu;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Import;

import vn.edu.tvu.auth.AuthFeatureConfiguration;
import vn.edu.tvu.event.EventFeatureConfiguration;
import vn.edu.tvu.notification.NotificationFeatureConfiguration;
import vn.edu.tvu.ticket.TicketFeatureConfiguration;

@SpringBootApplication(scanBasePackages = "vn.edu.tvu.monolith")
@Import({AuthFeatureConfiguration.class, EventFeatureConfiguration.class, TicketFeatureConfiguration.class,
        NotificationFeatureConfiguration.class})
public class MonolithApplication {

    public static void main(String[] args) {
        SpringApplication.run(MonolithApplication.class, args);
    }
}
