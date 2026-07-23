package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.domain.TicketInventory;
import vn.edu.tvu.ticket.repository.TicketInventoryRepository;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TicketCounterReconciliationServiceTest {

    @Mock
    private TicketInventoryRepository inventoryRepository;
    @Mock
    private TicketCounterService counterService;

    @Test
    void reconcile_resetsEachCounterToRemainingDerivedFromPostgres() {
        var openEvent = UUID.randomUUID();
        var soldOutEvent = UUID.randomUUID();
        var inv1 = mock(TicketInventory.class);
        when(inv1.getEventId()).thenReturn(openEvent);
        when(inv1.getTotalCapacity()).thenReturn(100);
        when(inv1.getApprovedCount()).thenReturn(30);
        var inv2 = mock(TicketInventory.class);
        when(inv2.getEventId()).thenReturn(soldOutEvent);
        when(inv2.getTotalCapacity()).thenReturn(50);
        when(inv2.getApprovedCount()).thenReturn(60);
        when(inventoryRepository.findAll()).thenReturn(List.of(inv1, inv2));

        new TicketCounterReconciliationService(inventoryRepository, counterService).reconcile();

        verify(counterService).reconcile(openEvent, 70);
        verify(counterService).reconcile(soldOutEvent, 0);
    }
}
