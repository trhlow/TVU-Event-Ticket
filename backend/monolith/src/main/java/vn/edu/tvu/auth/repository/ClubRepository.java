package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.Club;

import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubRepository extends JpaRepository<Club, UUID> {

    /**
     * Locks the club row. Clubs are locked before users, and users before trusted devices — one
     * agreed order across every flow, so opposite orders cannot deadlock against each other.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Club c where c.id = :clubId")
    Optional<Club> findByIdForUpdate(@Param("clubId") UUID clubId);

    Optional<Club> findByName(String name);

    boolean existsByName(String name);
}
