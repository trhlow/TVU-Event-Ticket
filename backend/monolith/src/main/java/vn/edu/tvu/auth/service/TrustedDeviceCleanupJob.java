package vn.edu.tvu.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Sweeps away trusted-device rows whose absolute expiry has passed.
 *
 * <p>Only expired rows. A revoked row stays until then on purpose: replay detection recognises a
 * stolen cookie by finding the revoked row it points at, so deleting revoked rows early would turn
 * a detectable theft into an anonymous "unknown token" and lose the ability to end that session.
 *
 * <p>Hourly rather than continuous — nothing depends on the row disappearing promptly; the table
 * simply must not grow without bound.
 */
@Component
public class TrustedDeviceCleanupJob {

    private static final Logger LOGGER = LoggerFactory.getLogger(TrustedDeviceCleanupJob.class);

    private final TrustedDeviceService trustedDeviceService;

    public TrustedDeviceCleanupJob(TrustedDeviceService trustedDeviceService) {
        this.trustedDeviceService = trustedDeviceService;
    }

    @Scheduled(fixedDelayString = "${tvu.auth.trusted-device.cleanup-delay:3600000}")
    public void removeExpiredDevices() {
        var deleted = trustedDeviceService.deleteExpired();
        if (deleted > 0) {
            LOGGER.info("Removed {} expired trusted-device row(s)", deleted);
        }
    }
}
