package vn.edu.tvu.auth.security;

import java.util.Optional;
import java.util.UUID;

/**
 * Reads the user's current {@code auth_version} — the value every issued JWT is checked against.
 *
 * <p>A narrow port rather than a repository dependency, so {@link AuthVersionValidator} can be
 * tested without a database, and so a future caching implementation can be swapped in behind it.
 * Any such cache may only ever <em>reject</em> on its own: approving from a cache hit would let a
 * revoked token through for as long as the entry is stale, which is the session-revocation hole
 * this whole design exists to close.
 */
@FunctionalInterface
public interface AuthVersionLookup {

    /**
     * @return the stored version, or empty when no such user exists (deleted account).
     */
    Optional<Long> currentAuthVersion(UUID userId);
}
