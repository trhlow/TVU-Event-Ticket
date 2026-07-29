package vn.edu.tvu.auth.security;

import vn.edu.tvu.auth.repository.UserRepository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads auth_version straight from PostgreSQL, with no cache in front of it.
 *
 * <p>That is a deliberate cost, not an oversight: a cache that can answer "valid" would keep a
 * revoked session alive for as long as its entry is stale, which defeats the point of being able
 * to revoke a session at all. If this ever needs a cache, it must be one that may only reject —
 * a hit can short-circuit to "denied", but letting a request through still has to reach the
 * database.
 */
@Component
public class DatabaseAuthVersionLookup implements AuthVersionLookup {

    private final UserRepository userRepository;

    public DatabaseAuthVersionLookup(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Long> currentAuthVersion(UUID userId) {
        return userRepository.findAuthVersionById(userId);
    }
}
