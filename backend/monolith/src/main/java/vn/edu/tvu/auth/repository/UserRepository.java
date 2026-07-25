package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.AuthMethod;
import vn.edu.tvu.auth.domain.MssvStatus;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.shared.domain.UserRole;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByExtSubject(String extSubject);

    Optional<User> findByEmail(String email);

    Optional<User> findByEmailAndAuthMethod(String email, AuthMethod authMethod);

    boolean existsByMssv(String mssv);

    boolean existsByMssvAndIdNot(String mssv, UUID id);

    List<User> findByRole(UserRole role);

    @Query("""
            select u from User u
            where (:role is null or u.role = :role)
              and (:mssvStatus is null or u.mssvStatus = :mssvStatus)
            order by u.createdAt desc
            """)
    List<User> search(@Param("role") UserRole role, @Param("mssvStatus") MssvStatus mssvStatus);

    @Query("select u.role as role, count(u) as count from User u group by u.role")
    List<UserRoleCountProjection> countGroupedByRole();

    // u.club.id, not u.clubId: User maps the club as a @ManyToOne association, not a raw UUID column.
    @Query("""
            select u.club.id as clubId, count(u.id) as total
            from User u
            where u.club.id in :clubIds and u.role = vn.edu.tvu.shared.domain.UserRole.ORGANIZER
            group by u.club.id
            """)
    List<ClubMemberCount> countOrganizersByClub(@Param("clubIds") Collection<UUID> clubIds);

    interface UserRoleCountProjection {
        UserRole getRole();
        long getCount();
    }
}
