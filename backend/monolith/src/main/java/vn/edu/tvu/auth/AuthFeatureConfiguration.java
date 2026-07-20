package vn.edu.tvu.auth;

import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.context.TypeExcludeFilter;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Configuration;

@Configuration
@ComponentScan(basePackageClasses = AuthFeatureConfiguration.class,
        excludeFilters = @ComponentScan.Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class))
@ConfigurationPropertiesScan(basePackageClasses = AuthFeatureConfiguration.class)
public class AuthFeatureConfiguration {
}
