package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.User;

import java.util.Optional;
import java.util.UUID;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByExtSubject(String extSubject);

    Optional<User> findByEmail(String email);

    boolean existsByMssv(String mssv);

    boolean existsByMssvAndIdNot(String mssv, UUID id);

    List<User> findByRole(vn.edu.tvu.auth.domain.UserRole role);
}
