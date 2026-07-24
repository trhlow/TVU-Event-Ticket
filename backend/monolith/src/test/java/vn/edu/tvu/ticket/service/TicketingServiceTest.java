package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.client.EventLookup;
import vn.edu.tvu.ticket.domain.TicketInventory;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;
import vn.edu.tvu.ticket.repository.TicketRepository;
import vn.edu.tvu.shared.audit.AuditRecorder;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TicketingServiceTest {

    @Mock
    private TicketInventoryRepository inventoryRepository;
    @Mock
    private TicketRepository ticketRepository;
    @Mock
    private TicketCounterService counterService;
    @Mock
    private QrPayloadVerifier qrVerifier;
    @Mock
    private AuditRecorder auditRecorder;
    @Mock
    private EventLookup eventLookup;

    private TicketingService service() {
        return new TicketingService(inventoryRepository, ticketRepository, counterService, qrVerifier,
                auditRecorder, eventLookup);
    }

    @Test
    void batchAvailabilityKeepsOpenEventWhenAnotherEventIsDraftWithoutInventory() {
        var openEvent = UUID.randomUUID();
        var draftEvent = UUID.randomUUID();

        var inventory = mock(TicketInventory.class);
        when(inventory.getTotalCapacity()).thenReturn(100);
        when(inventory.getApprovedCount()).thenReturn(30);
        when(inventoryRepository.findByEventId(openEvent)).thenReturn(Optional.of(inventory));
        when(counterService.remaining(openEvent)).thenReturn(70);

        // The DRAFT event has no inventory yet and getOpenEvent rejects a non-OPEN event with 404. Before
        // the fix this exception aborted the whole batch; now it must only drop this one id.
        when(inventoryRepository.findByEventId(draftEvent)).thenReturn(Optional.empty());
        when(eventLookup.getOpenEvent(draftEvent))
                .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Event not found"));

        var result = service().availability(List.of(openEvent, draftEvent));

        assertThat(result).containsOnlyKeys(openEvent);
        assertThat(result.get(openEvent).totalCapacity()).isEqualTo(100);
        assertThat(result.get(openEvent).approvedCount()).isEqualTo(30);
        assertThat(result.get(openEvent).remaining()).isEqualTo(70);
    }
}
