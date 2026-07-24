package vn.edu.tvu.auth.repository;

import vn.edu.tvu.auth.domain.TrustedDevice;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TrustedDeviceRepository extends JpaRepository<TrustedDevice, UUID> {

    Optional<TrustedDevice> findByTokenHash(String tokenHash);

    List<TrustedDevice> findByUserId(UUID userId);
}
