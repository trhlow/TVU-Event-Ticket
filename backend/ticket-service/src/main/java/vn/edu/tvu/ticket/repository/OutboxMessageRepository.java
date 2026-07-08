package vn.edu.tvu.ticket.repository;

import vn.edu.tvu.ticket.domain.OutboxMessage;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface OutboxMessageRepository extends JpaRepository<OutboxMessage, UUID> {
}
