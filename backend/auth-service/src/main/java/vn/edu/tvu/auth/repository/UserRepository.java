package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.User;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByExtSubject(String extSubject);

    Optional<User> findByEmail(String email);

    boolean existsByMssv(String mssv);
}
