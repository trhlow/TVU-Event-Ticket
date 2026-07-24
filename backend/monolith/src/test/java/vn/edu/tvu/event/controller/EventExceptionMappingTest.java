package vn.edu.tvu.event.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import vn.edu.tvu.auth.security.CookieCsrfFilter;
import vn.edu.tvu.auth.security.SecurityConfig;
import vn.edu.tvu.event.exception.EventNotFoundException;
import vn.edu.tvu.event.service.EventService;
import vn.edu.tvu.testsupport.AuthSecurityTestConfiguration;

import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Guards the HTTP status contract of the event API against advice collisions.
 *
 * <p>Both the auth and event advices are imported here, in the same order the monolith registers them
 * ({@code MonolithApplication}'s {@code @Import} list), because that ordering is the whole point: every
 * advice in this codebase declares a catch-all {@code @ExceptionHandler(Exception.class)}, and an
 * unscoped advice registered first will swallow every other package's domain exceptions and answer 500.
 * Testing the event advice in isolation would pass while production returns 500.
 */
@WebMvcTest(EventController.class)
@Import({SecurityConfig.class, CookieCsrfFilter.class, AuthSecurityTestConfiguration.class,
        vn.edu.tvu.auth.exception.GlobalExceptionHandler.class,
        vn.edu.tvu.event.exception.GlobalExceptionHandler.class})
class EventExceptionMappingTest {

    @Autowired MockMvc mockMvc;
    @MockitoBean EventService eventService;
    @MockitoBean JwtDecoder jwtDecoder;

    @Test
    void unknownEventReturns404NotFound() throws Exception {
        UUID missing = UUID.randomUUID();
        when(eventService.getPublic(missing)).thenThrow(new EventNotFoundException());

        mockMvc.perform(get("/api/events/{id}", missing))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("EVENT_NOT_FOUND"));
    }
}
