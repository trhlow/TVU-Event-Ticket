package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.domain.UserRole;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByExtSubject(String extSubject);

    Optional<User> findByEmail(String email);

    boolean existsByMssv(String mssv);

    boolean existsByMssvAndIdNot(String mssv, UUID id);

    List<User> findByRole(UserRole role);

    @Query("select u.role as role, count(u) as count from User u group by u.role")
    List<UserRoleCountProjection> countGroupedByRole();

    interface UserRoleCountProjection {
        UserRole getRole();
        long getCount();
    }
}
