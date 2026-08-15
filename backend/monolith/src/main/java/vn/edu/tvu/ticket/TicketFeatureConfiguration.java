package vn.edu.tvu.ticket;

import vn.edu.tvu.shared.messaging.MessagingProperties;

import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.TypeExcludeFilter;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;

@Configuration
@ComponentScan(basePackageClasses = TicketFeatureConfiguration.class,
        excludeFilters = @ComponentScan.Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class))
@ConfigurationPropertiesScan(basePackageClasses = TicketFeatureConfiguration.class)
@EnableConfigurationProperties(MessagingProperties.class)
// @EnableScheduling deliberately lives on SchedulingConfiguration instead, which is
// @Profile("!migration") -- see that class for what enabling it here cost on the real VPS.
public class TicketFeatureConfiguration {
}
