package vn.edu.tvu.ticket.mapper;

import vn.edu.tvu.ticket.domain.TicketInventory;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

class TicketInventoryMapperTest {

    @Test
    void mapsCapacityAndCalculatedRemaining() {
        var eventId = UUID.randomUUID();
        var clubId = UUID.randomUUID();
        var inventoryId = UUID.randomUUID();
        var start = Instant.parse("2026-07-20T01:00:00Z");
        var inventory = TicketInventory.create(eventId, clubId, 3, "Open day", start,
                start.plusSeconds(7200), "TVU Hall");
        ReflectionTestUtils.setField(inventory, "id", inventoryId);
        inventory.reserveApprovedSlot();

        var response = new TicketInventoryMapper().toResponse(inventory);

        assertThat(response.id()).isEqualTo(inventoryId);
        assertThat(response.eventId()).isEqualTo(eventId);
        assertThat(response.clubId()).isEqualTo(clubId);
        assertThat(response.totalCapacity()).isEqualTo(3);
        assertThat(response.approvedCount()).isOne();
        assertThat(response.remainingCount()).isEqualTo(2);
    }
}
