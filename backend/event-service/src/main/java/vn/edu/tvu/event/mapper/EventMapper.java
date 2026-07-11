package vn.edu.tvu.event.mapper;

import org.mapstruct.Mapper;
import vn.edu.tvu.event.domain.Event;
import vn.edu.tvu.event.dto.response.EventResponse;

@Mapper(componentModel = "spring")
public interface EventMapper {
    EventResponse toResponse(Event event);
}
