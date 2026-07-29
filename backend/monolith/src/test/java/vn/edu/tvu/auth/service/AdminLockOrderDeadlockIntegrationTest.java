package vn.edu.tvu.auth.service;

import vn.edu.tvu.MonolithApplication;
import vn.edu.tvu.auth.domain.Club;
import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.repository.ClubRepository;
import vn.edu.tvu.auth.repository.UserRepository;
import vn.edu.tvu.auth.support.AbstractPostgresIntegrationTest;

import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The evidence H7 and H8 were left waiting for.
 *
 * <p>Both fixes rest on one claim: every flow that touches a user row and its trusted devices takes
 * them in the same order, user first. A claim like that cannot be checked by reading — it holds or
 * fails only when two transactions actually interleave, and when it fails PostgreSQL kills one of
 * them with SQLSTATE {@code 40P01}. So this runs the flows against a real database, concurrently,
 * many times.
 *
 * <p>Two pairings, for different reasons:
 * <ul>
 *   <li>{@code refresh} against {@code lockOrganizer} is where the cycle actually was.
 *       {@code lockOrganizer} bumps {@code auth_version} — locking the user row at flush — and then
 *       revokes the device rows. {@code refresh} used to rotate the device first and read the user
 *       afterwards, which is the same two rows in the opposite order.
 *   <li>{@code refresh} against {@code deactivateClub} is the pairing the checklist names.
 *       {@code deactivateClub} locks the club and then its members, and never touches a device row,
 *       so there is no cycle to find here — what this asserts is the business invariant, that a
 *       session cannot survive the deactivation by slipping through the race.
 * </ul>
 *
 * <p>Neither test asserts "an exception did not happen". Both flows are allowed to fail: whichever
 * loses the race legitimately rejects its caller. What must not happen is a transaction dying
 * <em>because of the lock order</em>, and what must hold afterwards is that no token minted during
 * the race still works.
 */
@SpringBootTest(classes = MonolithApplication.class,
        properties = "spring.rabbitmq.listener.simple.auto-startup=false")
class AdminLockOrderDeadlockIntegrationTest extends AbstractPostgresIntegrationTest {

    /**
     * Deadlocks are timing. One round proves nothing; PostgreSQL's deadlock detector also runs on a
     * one second cycle by default, so a genuine cycle is not always instant. Twelve rounds with a
     * barrier lines the two transactions up often enough to be worth trusting — verified by
     * reintroducing the old order, which fails inside the first few rounds every time.
     */
    private static final int ROUNDS = 12;

    /** Long enough for a slow container, short enough that a real hang fails instead of hanging CI. */
    private static final int ROUND_TIMEOUT_SECONDS = 30;

    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;
    @Autowired TrustedDeviceService trustedDeviceService;
    @Autowired AdminOtpService adminOtpService;
    @Autowired AdminManagementService adminManagementService;

    private ExecutorService executor;

    @BeforeEach
    void startExecutor() {
        executor = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void stopExecutor() {
        executor.shutdownNow();
    }

    @Test
    @DisplayName("refresh ⟂ lockOrganizer: no deadlock, and no device survives the lock")
    void refreshAndLockOrganizerNeverDeadlock() throws Exception {
        for (int round = 0; round < ROUNDS; round++) {
            var organizer = seedOrganizer("lock-" + round);
            var deviceToken = rememberDevice(organizer);

            var outcomes = raceInParallel(
                    () -> adminOtpService.refresh(deviceToken),
                    () -> adminManagementService.lockOrganizer(UUID.randomUUID(), organizer.getId()),
                    round);

            assertNoLockOrderFailure(outcomes, round);
            assertNoSessionSurvives(deviceToken, outcomes.refreshResult(), round);
        }
    }

    @Test
    @DisplayName("refresh ⟂ deactivateClub: no deadlock, and no session outlives the deactivation")
    void refreshAndDeactivateClubNeverDeadlock() throws Exception {
        for (int round = 0; round < ROUNDS; round++) {
            var organizer = seedOrganizer("deactivate-" + round);
            var clubId = organizer.getClub().getId();
            var deviceToken = rememberDevice(organizer);

            var outcomes = raceInParallel(
                    () -> adminOtpService.refresh(deviceToken),
                    () -> {
                        adminManagementService.deactivateClub(UUID.randomUUID(), clubId);
                        return null;
                    },
                    round);

            assertNoLockOrderFailure(outcomes, round);
            assertThat(clubRepository.findById(clubId).orElseThrow().isActive())
                    .as("round %d: the club must end up deactivated whichever thread won", round)
                    .isFalse();
            assertNoSessionSurvives(deviceToken, outcomes.refreshResult(), round);
        }
    }

    // ---------------------------------------------------------------- helpers

    private record Outcomes(Throwable refreshFailure, Object refreshResult, Throwable adminFailure) {

        List<Throwable> failures() {
            return java.util.stream.Stream.of(refreshFailure, adminFailure).filter(java.util.Objects::nonNull).toList();
        }
    }

    /**
     * Starts both callables on a barrier so they enter their transactions together, rather than
     * hoping a sleep lands in the right place. Each future has its own timeout: a cycle that the
     * database somehow failed to detect shows up as a failed test, never as a stuck build.
     */
    private Outcomes raceInParallel(Callable<?> refresh, Callable<?> adminAction, int round) throws Exception {
        var barrier = new CyclicBarrier(2);

        Future<?> refreshFuture = executor.submit(() -> {
            barrier.await();
            return refresh.call();
        });
        Future<?> adminFuture = executor.submit(() -> {
            barrier.await();
            return adminAction.call();
        });

        Object refreshResult = null;
        Throwable refreshFailure = null;
        try {
            refreshResult = refreshFuture.get(ROUND_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (java.util.concurrent.ExecutionException e) {
            refreshFailure = e.getCause();
        } catch (java.util.concurrent.TimeoutException e) {
            throw new AssertionError("round " + round + ": refresh() did not finish within "
                    + ROUND_TIMEOUT_SECONDS + "s — a lock is being held that nothing releases", e);
        }

        Throwable adminFailure = null;
        try {
            adminFuture.get(ROUND_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        } catch (java.util.concurrent.ExecutionException e) {
            adminFailure = e.getCause();
        } catch (java.util.concurrent.TimeoutException e) {
            throw new AssertionError("round " + round + ": the admin action did not finish within "
                    + ROUND_TIMEOUT_SECONDS + "s — a lock is being held that nothing releases", e);
        }

        return new Outcomes(refreshFailure, refreshResult, adminFailure);
    }

    /**
     * Either flow may reject its caller — that is the race resolving, not a defect. Only a database
     * error caused by the locking itself is a failure: 40P01 is a detected deadlock, 55P03 a lock
     * that could not be taken, 40001 a serialization failure.
     */
    private void assertNoLockOrderFailure(Outcomes outcomes, int round) {
        for (var failure : outcomes.failures()) {
            var sqlState = sqlStateOf(failure);
            assertThat(sqlState)
                    .as("round %d: a transaction died from the lock order, not from the race resolving."
                            + " Root cause: %s", round, describe(failure))
                    .isNotIn("40P01", "55P03", "40001");
        }
    }

    /**
     * The invariant both fixes exist for: once the admin action commits, nothing minted during the
     * race still works — neither the cookie that went in, nor a successor the refresh may have
     * written on its way past.
     */
    private void assertNoSessionSurvives(String originalToken, Object refreshResult, int round) {
        assertThatThrownBy(() -> adminOtpService.refresh(originalToken))
                .as("round %d: the original device cookie still refreshes after the account was"
                        + " locked or its club deactivated", round)
                .isInstanceOf(Exception.class);

        if (refreshResult instanceof AdminSession session && session.deviceToken() != null) {
            assertThatThrownBy(() -> adminOtpService.refresh(session.deviceToken()))
                    .as("round %d: the successor cookie written during the race outlived the"
                            + " revocation — this is the gap H8 was raised for", round)
                    .isInstanceOf(Exception.class);
        }
    }

    private User seedOrganizer(String suffix) {
        var club = clubRepository.saveAndFlush(new Club("CLB " + suffix + "-" + UUID.randomUUID(), null));
        return userRepository.saveAndFlush(
                User.emailOtpOrganizer("organizer-" + suffix + "-" + UUID.randomUUID() + "@example.com",
                        "Organizer " + suffix, club));
    }

    private String rememberDevice(User organizer) {
        return trustedDeviceService.remember(organizer.getId(), organizer.getAuthVersion()).rawToken();
    }

    private static String sqlStateOf(Throwable failure) {
        for (var cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sqlException) {
                return sqlException.getSQLState();
            }
            if (cause.getCause() == cause) {
                break;
            }
        }
        return null;
    }

    private static String describe(Throwable failure) {
        return failure == null ? "none" : failure.getClass().getSimpleName() + ": " + failure.getMessage();
    }
}
