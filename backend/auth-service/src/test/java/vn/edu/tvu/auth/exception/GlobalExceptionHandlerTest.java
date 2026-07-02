package vn.edu.tvu.auth.exception;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the sample advice produces the consistent {@link ErrorResponse} body for each branch.
 * Uses standalone MockMvc with a throwaway controller so no Spring context / DB is needed.
 */
class GlobalExceptionHandlerTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new ProbeController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void validationError_returns400_withFieldErrors() throws Exception {
        mockMvc.perform(post("/probe/validate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.path").value("/probe/validate"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("name"));
    }

    @Test
    void responseStatusException_mapsStatusAndCode() throws Exception {
        mockMvc.perform(post("/probe/conflict"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"))
                .andExpect(jsonPath("$.message").value("already exists"));
    }

    @Test
    void unhandledException_returns500() throws Exception {
        mockMvc.perform(post("/probe/boom"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"));
    }

    @RestController
    static class ProbeController {
        @PostMapping("/probe/validate")
        void validate(@Valid @RequestBody Payload payload) {}

        @PostMapping("/probe/conflict")
        void conflict() {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "already exists");
        }

        @PostMapping("/probe/boom")
        void boom() {
            throw new IllegalStateException("unexpected");
        }
    }

    record Payload(@NotBlank String name) {}
}
