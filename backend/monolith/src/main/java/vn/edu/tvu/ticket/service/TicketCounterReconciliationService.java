package vn.edu.tvu.ticket.service;

import vn.edu.tvu.ticket.repository.TicketInventoryRepository;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Redis is decremented inside the approval transaction and compensated on rollback, but a hard process
 * kill between the decrement and commit can leave the counter permanently below the true remaining count,
 * which would reject valid reservations forever (the database guard still prevents overbooking, so drift
 * is only ever safe-side). PostgreSQL is the source of truth: this job periodically rewrites each counter
 * to {@code totalCapacity - approvedCount}. Live approvals move Redis and approvedCount together, so any
 * transient over-count between a concurrent approval and this rewrite is caught by the database's own
 * capacity guard.
 */
@Service
public class TicketCounterReconciliationService {

    private final TicketInventoryRepository inventoryRepository;
    private final TicketCounterService counterService;

    public TicketCounterReconciliationService(TicketInventoryRepository inventoryRepository,
            TicketCounterService counterService) {
        this.inventoryRepository = inventoryRepository;
        this.counterService = counterService;
    }

    @Scheduled(fixedDelayString = "${tvu.ticket.counter.reconcile-delay:300000}")
    public void reconcile() {
        inventoryRepository.findAll().forEach(inventory ->
                counterService.reconcile(inventory.getEventId(),
                        Math.max(0, inventory.getTotalCapacity() - inventory.getApprovedCount())));
    }
}
