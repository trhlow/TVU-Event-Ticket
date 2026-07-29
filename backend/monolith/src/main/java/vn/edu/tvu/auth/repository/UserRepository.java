package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.AuthMethod;
import vn.edu.tvu.auth.domain.MssvStatus;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.shared.domain.UserRole;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {

    /**
     * Reads just the revocation counter, on the authentication path of every request. A projection
     * rather than the whole aggregate: this runs far more often than anything else in the app, and
     * loading the user (and its club) to compare one number would be wasteful.
     */
    @Query("select u.authVersion from User u where u.id = :userId")
    Optional<Long> findAuthVersionById(@Param("userId") UUID userId);

    /**
     * Resolves an Entra login. Matching the subject <em>and</em> the sign-in method is the second
     * layer behind the V13 CHECK constraint: should an admin row ever end up carrying a subject —
     * a manual fix during an incident, a future code path — the Entra flow still cannot reach it.
     */
    Optional<User> findByExtSubjectAndAuthMethod(String extSubject, AuthMethod authMethod);

    /**
     * Locks the user row for the duration of the transaction.
     *
     * <p>Every flow that touches trusted devices has to take this lock first — see the ordering note
     * on {@link vn.edu.tvu.auth.service.TrustedDeviceService}. Refresh used to mutate the device row
     * and read the user afterwards, i.e. device → user, while sign-out-all and lock-organiser go
     * user → device. Two opposite orders running at once is a textbook deadlock, and PostgreSQL
     * resolves it by killing one transaction: a random 500 on the sign-in path.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.id = :userId")
    Optional<User> findByIdForUpdate(@Param("userId") UUID userId);

    /**
     * Every member of a club, locked, in id order.
     *
     * <p>Ordered on purpose: deactivating a club locks several user rows at once, and two such
     * operations grabbing the same rows in different orders would deadlock. A single agreed order —
     * ascending id — removes that.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.club.id = :clubId order by u.id")
    List<User> findByClubIdForUpdate(@Param("clubId") UUID clubId);

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
