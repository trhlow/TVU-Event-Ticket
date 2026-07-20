package vn.edu.tvu.ticket;

import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.context.TypeExcludeFilter;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;

@Configuration
@ComponentScan(basePackageClasses = TicketFeatureConfiguration.class,
        excludeFilters = @ComponentScan.Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class))
@ConfigurationPropertiesScan(basePackageClasses = TicketFeatureConfiguration.class)
@EnableScheduling
public class TicketFeatureConfiguration {
}
