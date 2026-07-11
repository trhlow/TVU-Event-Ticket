package vn.edu.tvu.event.dto.request;

import jakarta.validation.constraints.NotNull;
import vn.edu.tvu.event.domain.EventStatus;

public record ChangeEventStatusRequest(@NotNull EventStatus status) {}
