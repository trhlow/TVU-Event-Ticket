package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.Club;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ClubRepository extends JpaRepository<Club, UUID> {

    Optional<Club> findByName(String name);

    boolean existsByName(String name);
}
