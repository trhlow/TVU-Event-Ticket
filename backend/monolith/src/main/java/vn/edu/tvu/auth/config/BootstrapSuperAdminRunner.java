package vn.edu.tvu.auth.config;

import vn.edu.tvu.auth.domain.User;
import vn.edu.tvu.auth.repository.UserRepository;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class BootstrapSuperAdminRunner implements ApplicationRunner {

    private final BootstrapAdminProperties properties;
    private final UserRepository userRepository;

    public BootstrapSuperAdminRunner(BootstrapAdminProperties properties, UserRepository userRepository) {
        this.properties = properties;
        this.userRepository = userRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        for (var email : properties.emails()) {
            if (userRepository.findByEmail(email).isEmpty()) {
                userRepository.save(User.emailOtpSuperAdmin(email, "Bootstrap Admin"));
            }
        }
    }
}
