package vn.edu.tvu.ticket.mapper;

import vn.edu.tvu.ticket.domain.TicketInventory;
import vn.edu.tvu.ticket.dto.response.TicketInventoryResponse;

import org.springframework.stereotype.Component;

@Component
public class TicketInventoryMapper {

    public TicketInventoryResponse toResponse(TicketInventory inventory) {
        return new TicketInventoryResponse(inventory.getId(), inventory.getEventId(), inventory.getClubId(),
                inventory.getTotalCapacity(), inventory.getApprovedCount(),
                inventory.getTotalCapacity() - inventory.getApprovedCount(), inventory.getEventTitle(),
                inventory.getEventStartAt(), inventory.getEventEndAt(), inventory.getEventLocation());
    }
}
