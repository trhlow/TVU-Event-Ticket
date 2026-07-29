package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.TrustedDevice;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TrustedDeviceRepository extends JpaRepository<TrustedDevice, UUID> {

    Optional<TrustedDevice> findByTokenHash(String tokenHash);

    List<TrustedDevice> findByUserId(UUID userId);

    /**
     * Revokes the live token of one browser. This is what a normal logout uses: it ends that
     * browser's session and leaves the user's other devices alone.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update TrustedDevice d set d.revokedAt = :now where d.deviceFamilyId = :familyId "
            + "and d.revokedAt is null")
    int revokeActiveInFamily(@Param("familyId") UUID familyId, @Param("now") Instant now);

    /**
     * Deletes only rows whose absolute expiry has passed. Revoked rows must survive until then:
     * replay detection works by finding the revoked row a stolen cookie points at, and deleting it
     * early turns a detectable theft into an anonymous "unknown token".
     */
    @Modifying
    @Query("delete from TrustedDevice d where d.expiresAt < :cutoff")
    int deleteExpired(@Param("cutoff") Instant cutoff);

    /**
     * Rotates a device token atomically: flips {@code revoked_at} from null in a single UPDATE and reports
     * how many rows it touched. The database row lock serialises concurrent refreshes of the same cookie,
     * so exactly one caller sees a count of 1 (it won the rotation) and any other sees 0 (the token was
     * already spent — a replay). A read-then-write in Java could not guarantee this: two transactions could
     * both read null and both succeed, minting two live successors and never detecting the reuse.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update TrustedDevice d set d.revokedAt = :now where d.tokenHash = :tokenHash "
            + "and d.revokedAt is null")
    int revokeIfActive(@Param("tokenHash") String tokenHash, @Param("now") Instant now);
}
