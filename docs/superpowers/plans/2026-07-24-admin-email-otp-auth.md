# Admin Email OTP Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give super admins and club organizers a passwordless sign-in by emailed code, and stop Entra from being able to reach those accounts at all.

**Architecture:** A new `auth_method` column binds each role to exactly one sign-in path, enforced in the service layer. Entra keeps `/api/auth/login` and serves only students. Admins get `/api/auth/otp/request`, `/api/auth/otp/verify` and `/api/auth/session/refresh`, with codes in Redis and remembered browsers in a `trusted_devices` table. The claim-by-email and bootstrap-promotion paths are deleted, not guarded.

**Tech Stack:** Java 25, Spring Boot 4.0.7, Spring Security, JPA/Hibernate, Flyway, PostgreSQL 18, Redis (Lettuce), JUnit 5, Mockito, AssertJ, Testcontainers, React 19 + TypeScript + Vite.

**Spec:** `docs/superpowers/specs/2026-07-24-admin-email-otp-auth-design.md`

## Global Constraints

- Build with JDK 25. The enforcer plugin requires `[25,26)`. Run Maven with `JAVA_HOME` pointed at the JDK 25 install, e.g. `C:\Program Files\Eclipse Adoptium\jdk-25.0.3.9-hotspot`.
- Run Maven from `backend/`: `mvn -B -pl monolith test -Dtest=SomeTest`. Do **not** pass `-am` with `spring-boot:run` — the parent POM has no main class.
- Docker must be running for Testcontainers. A skipped Testcontainers test is not a passing test; CI fails the build on any skip.
- Commit messages: `<type>: <subject>`, imperative, under 70 chars. **Never** add `Co-Authored-By` or any AI attribution — this repo forbids it.
- Constructor injection with `private final` fields. No `@Autowired` fields.
- Never expose `@Entity` through the API. DTOs only.
- Comment only where the *why* is non-obvious. Do not narrate what the code does.
- Flyway migrations are immutable once merged. Current highest is `V9`.
- UI strings are Vietnamese. Code, comments and commit messages are English.

---

### Task 1: Bind each role to one sign-in method

**Files:**
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/domain/AuthMethod.java`
- Create: `backend/monolith/src/main/resources/db/migration/V10__users_auth_method.sql`
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/domain/User.java`
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/repository/UserRepository.java`
- Test: `backend/monolith/src/test/java/vn/edu/tvu/auth/repository/AuthRepositoryTest.java`

**Interfaces:**
- Consumes: nothing.
- Produces: `AuthMethod.MICROSOFT`, `AuthMethod.EMAIL_OTP`; `User.getAuthMethod()`; `User.emailOtpOrganizer(String email, String displayName, Club club)`; `User.emailOtpSuperAdmin(String email, String displayName)`; `UserRepository.findByEmailAndAuthMethod(String email, AuthMethod method)` returning `Optional<User>`.

- [ ] **Step 1: Write the failing test**

Add to `AuthRepositoryTest`:

```java
@Test
void findByEmailAndAuthMethod_ignoresAccountsOnTheOtherMethod() {
    var student = userRepository.save(User.student("entra:s1", "shared@tvu.edu.vn", "Student"));

    var asOtp = userRepository.findByEmailAndAuthMethod("shared@tvu.edu.vn", AuthMethod.EMAIL_OTP);
    var asMicrosoft = userRepository.findByEmailAndAuthMethod("shared@tvu.edu.vn", AuthMethod.MICROSOFT);

    assertThat(asOtp).isEmpty();
    assertThat(asMicrosoft).contains(student);
}
```

Add the import `vn.edu.tvu.auth.domain.AuthMethod;`.

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -B -pl monolith test -Dtest=AuthRepositoryTest#findByEmailAndAuthMethod_ignoresAccountsOnTheOtherMethod`
Expected: FAIL to compile — `cannot find symbol: class AuthMethod`.

- [ ] **Step 3: Write minimal implementation**

`AuthMethod.java`:

```java
package vn.edu.tvu.auth.domain;

public enum AuthMethod {
    MICROSOFT,
    EMAIL_OTP
}
```

In `User.java`, add the field next to `extSubject` and make `extSubject` nullable:

```java
    @Column(name = "ext_subject")
    private String extSubject;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_method", nullable = false, length = 20)
    private AuthMethod authMethod = AuthMethod.MICROSOFT;
```

Add the import `jakarta.persistence.EnumType;` if absent. Add two factories beside the existing ones:

```java
    public static User emailOtpOrganizer(String email, String displayName, Club club) {
        var user = new User(null, email, displayName, UserRole.ORGANIZER, club);
        user.authMethod = AuthMethod.EMAIL_OTP;
        return user;
    }

    public static User emailOtpSuperAdmin(String email, String displayName) {
        var user = new User(null, email, displayName, UserRole.SUPER_ADMIN, null);
        user.authMethod = AuthMethod.EMAIL_OTP;
        return user;
    }
```

Add the accessor:

```java
    public AuthMethod getAuthMethod() {
        return authMethod;
    }
```

In `UserRepository.java`:

```java
    Optional<User> findByEmailAndAuthMethod(String email, AuthMethod authMethod);
```

with the import `vn.edu.tvu.auth.domain.AuthMethod;`.

`V10__users_auth_method.sql`:

```sql
-- Role now decides the sign-in method, so accounts that admins create have no Entra subject
-- at all. Existing organizers and super admins are moved to the emailed-code path; their
-- old subjects are dropped so no Entra login can reach them.
ALTER TABLE users ADD COLUMN auth_method VARCHAR(20);

UPDATE users SET auth_method = 'EMAIL_OTP' WHERE role IN ('ORGANIZER', 'SUPER_ADMIN');
UPDATE users SET auth_method = 'MICROSOFT' WHERE auth_method IS NULL;
UPDATE users SET ext_subject = NULL WHERE auth_method = 'EMAIL_OTP';

ALTER TABLE users ALTER COLUMN auth_method SET NOT NULL;
ALTER TABLE users ALTER COLUMN ext_subject DROP NOT NULL;

-- A partial index keeps subjects unique among the accounts that still have one.
DROP INDEX IF EXISTS users_ext_subject_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_ext_subject_key;
CREATE UNIQUE INDEX ux_users_ext_subject_not_null
    ON users (ext_subject) WHERE ext_subject IS NOT NULL;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn -B -pl monolith test -Dtest=AuthRepositoryTest`
Expected: PASS, `Tests run: 10, Failures: 0, Errors: 0, Skipped: 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/monolith/src/main/java/vn/edu/tvu/auth/domain/AuthMethod.java \
        backend/monolith/src/main/java/vn/edu/tvu/auth/domain/User.java \
        backend/monolith/src/main/java/vn/edu/tvu/auth/repository/UserRepository.java \
        backend/monolith/src/main/resources/db/migration/V10__users_auth_method.sql \
        backend/monolith/src/test/java/vn/edu/tvu/auth/repository/AuthRepositoryTest.java
git commit -m "feat: bind each role to one sign-in method"
```

---

### Task 2: Close the Entra path into admin accounts

This is the security core of the change. Write the proof first.

**Files:**
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/service/AuthApplicationService.java`
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/domain/User.java`
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/service/AdminManagementService.java`
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/config/BootstrapSuperAdminRunner.java`
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/config/BootstrapAdminProperties.java`
- Test: `backend/monolith/src/test/java/vn/edu/tvu/auth/service/AuthApplicationServiceTest.java`
- Test: `backend/monolith/src/test/java/vn/edu/tvu/auth/service/AdminManagementServiceTest.java`
- Test: `backend/monolith/src/test/java/vn/edu/tvu/auth/config/BootstrapSuperAdminRunnerTest.java`

**Interfaces:**
- Consumes: `AuthMethod`, `User.emailOtpOrganizer`, `User.emailOtpSuperAdmin`, `UserRepository.findByEmailAndAuthMethod` from Task 1.
- Produces: `BootstrapAdminProperties.emails()` returning `List<String>` of normalized addresses.

- [ ] **Step 1: Write the failing test**

Add to `AuthApplicationServiceTest`:

```java
@Test
void login_doesNotClaimAnAdminAccountThatSharesTheEmail() {
    var club = new Club("CLB Tin hoc", "Hoc thuat CNTT");
    var clubAccount = User.emailOtpOrganizer("clbtinhoc@tvu.edu.vn", "CLB Tin hoc", club);
    when(identityProvider.verify("token"))
            .thenReturn(new ExternalIdentity("entra:attacker", "clbtinhoc@tvu.edu.vn", "Nguoi La"));
    when(userRepository.findByExtSubject("entra:attacker")).thenReturn(Optional.empty());
    when(userRepository.save(any(User.class))).thenAnswer(i -> i.getArgument(0));

    var result = service.login(new LoginRequest("token", null));

    assertThat(result.profile().role()).isEqualTo(UserRole.SINH_VIEN);
    assertThat(clubAccount.getRole()).isEqualTo(UserRole.ORGANIZER);
    assertThat(clubAccount.getExtSubject()).isNull();
}
```

The Entra login must create a brand-new student and leave the club account untouched.

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -B -pl monolith test -Dtest=AuthApplicationServiceTest#login_doesNotClaimAnAdminAccountThatSharesTheEmail`
Expected: FAIL — the current `resolveUser` falls back to `findByEmail`, so the club account is claimed and the assertion on `getExtSubject()` fails.

- [ ] **Step 3: Write minimal implementation**

In `AuthApplicationService`, replace `resolveUser`, `refreshIdentity`, `createUser` and `isBootstrapAdmin` with:

```java
    /**
     * The Entra subject is the stable, non-reassignable identifier and is now the only thing this flow
     * matches on. Admin accounts live on the emailed-code path and carry no subject, so Entra cannot
     * reach them by address.
     */
    private User resolveUser(ExternalIdentity identity) {
        return userRepository.findByExtSubject(identity.subject())
                .map(user -> {
                    user.updateIdentity(identity.subject(), identity.email(), identity.displayName());
                    return user;
                })
                .orElseGet(() -> User.student(identity.subject(), identity.email(), identity.displayName()));
    }
```

Delete the `bootstrapAdminProperties` field, its constructor parameter, and the now-unused import. Update every construction of `AuthApplicationService` in tests accordingly.

In `User.java`, delete `PENDING_SUBJECT_PREFIX`, `BOOTSTRAP_SUBJECT_PREFIX`, `hasUnclaimedPlaceholderSubject()`, `resetExternalSubject(String)`, `promoteToSuperAdmin()` and `promoteToOrganizer(Club)`, along with the class-level Javadoc paragraph describing placeholders.

In `AdminManagementService`, restore `createOrganizer` to a plain create on the new method and delete `isUnassignedStudent` and `resetOrganizer`:

```java
    @Transactional
    public OrganizerResponse createOrganizer(UUID actorId, CreateOrganizerRequest request) {
        var email = request.email().trim().toLowerCase(Locale.ROOT);
        if (userRepository.findByEmail(email).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email already exists");
        }
        var club = clubRepository.findById(request.clubId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
        if (!club.isActive()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Club is inactive");
        }
        var organizer = userRepository.save(
                User.emailOtpOrganizer(email, request.displayName().trim(), club));
        auditLogService.recordAudit(actorId, "auth.organizer.create", "user", organizer.getId(),
                "{\"email\":\"" + organizer.getEmail() + "\"}");
        return organizerResponse(organizer);
    }
```

Delete `createOrganizer_promotesStudentWhoAlreadySignedIn` and `createOrganizer_rejectsEmailAlreadyRunningAnotherClub` from `AdminManagementServiceTest`, and delete the `resetOrganizer` endpoint from `AdminController`.

In `BootstrapAdminProperties`, accept a list:

```java
package vn.edu.tvu.auth.config;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

public record BootstrapAdminProperties(String email) {

    /**
     * A deployment names more than one address so a single unreachable mailbox cannot lock every
     * super admin out of an application that has no password to fall back on.
     */
    public List<String> emails() {
        if (email == null || email.isBlank()) {
            return List.of();
        }
        return Arrays.stream(email.split(","))
                .map(value -> value.trim().toLowerCase(Locale.ROOT))
                .filter(value -> !value.isEmpty())
                .toList();
    }
}
```

In `BootstrapSuperAdminRunner`:

```java
    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        for (var email : properties.emails()) {
            if (userRepository.findByEmail(email).isEmpty()) {
                userRepository.save(User.emailOtpSuperAdmin(email, "Bootstrap Admin"));
            }
        }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `mvn -B -pl monolith test -Dtest='Auth*Test,AdminManagementServiceTest,BootstrapSuperAdminRunnerTest'`
Expected: PASS, no failures, no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/monolith/src/main/java/vn/edu/tvu/auth backend/monolith/src/test/java/vn/edu/tvu/auth
git commit -m "fix: stop Entra logins reaching admin accounts"
```

---

### Task 3: Issue and store one-time codes

**Files:**
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/otp/OtpCodeIssuer.java`
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/otp/RandomOtpCodeIssuer.java`
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/otp/FixedOtpCodeIssuer.java`
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/otp/OtpStore.java`
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/otp/DemoOtpProperties.java`
- Test: `backend/monolith/src/test/java/vn/edu/tvu/auth/otp/OtpStoreTest.java`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `OtpCodeIssuer.issue(String email)` returning `String`; `OtpStore.save(UUID userId, String code)`, `OtpStore.verify(UUID userId, String code)` returning `OtpStore.Result` — an enum of `OK`, `INVALID`, `EXPIRED`.

- [ ] **Step 1: Write the failing test**

```java
package vn.edu.tvu.auth.otp;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class OtpStoreTest {

    private final OtpStore store = new OtpStore(new InMemoryOtpBackend(), 5);

    @Test
    void verify_acceptsTheCodeOnce() {
        var userId = UUID.randomUUID();
        store.save(userId, "123456");

        assertThat(store.verify(userId, "123456")).isEqualTo(OtpStore.Result.OK);
        assertThat(store.verify(userId, "123456")).isEqualTo(OtpStore.Result.EXPIRED);
    }

    @Test
    void verify_destroysTheCodeAfterFiveWrongAttempts() {
        var userId = UUID.randomUUID();
        store.save(userId, "123456");

        for (var attempt = 0; attempt < 5; attempt++) {
            assertThat(store.verify(userId, "000000")).isEqualTo(OtpStore.Result.INVALID);
        }

        assertThat(store.verify(userId, "123456")).isEqualTo(OtpStore.Result.EXPIRED);
    }
}
```

Implement `InMemoryOtpBackend` as a test fixture in the same file's package implementing whatever narrow interface `OtpStore` depends on, so the store's rules are tested without Redis. Redis wiring is covered by the integration test in Task 5.

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -B -pl monolith test -Dtest=OtpStoreTest`
Expected: FAIL to compile — `cannot find symbol: class OtpStore`.

- [ ] **Step 3: Write minimal implementation**

`OtpCodeIssuer.java`:

```java
package vn.edu.tvu.auth.otp;

public interface OtpCodeIssuer {

    String issue(String email);
}
```

`RandomOtpCodeIssuer.java`:

```java
package vn.edu.tvu.auth.otp;

import java.security.SecureRandom;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("!dev & !test")
public class RandomOtpCodeIssuer implements OtpCodeIssuer {

    private final SecureRandom random = new SecureRandom();

    @Override
    public String issue(String email) {
        return "%06d".formatted(random.nextInt(1_000_000));
    }
}
```

`FixedOtpCodeIssuer.java`:

```java
package vn.edu.tvu.auth.otp;

import java.security.SecureRandom;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Local convenience: the configured demo address always gets the same code so development does not
 * depend on reading a mailbox. Every other address still gets a real random one. This bean is
 * {@code @Profile({"dev", "test"})} so it cannot exist in production at all, and
 * {@code ProductionSecretsValidator} fails startup if its configuration leaks there.
 */
@Component
@Profile({"dev", "test"})
public class FixedOtpCodeIssuer implements OtpCodeIssuer {

    private final DemoOtpProperties properties;
    private final SecureRandom random = new SecureRandom();

    public FixedOtpCodeIssuer(DemoOtpProperties properties) {
        this.properties = properties;
    }

    @Override
    public String issue(String email) {
        if (properties.matches(email)) {
            return properties.code();
        }
        return "%06d".formatted(random.nextInt(1_000_000));
    }
}
```

`DemoOtpProperties.java`:

```java
package vn.edu.tvu.auth.otp;

import java.util.Locale;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tvu.auth.demo-otp")
public record DemoOtpProperties(String email, String code) {

    public boolean matches(String candidate) {
        return email != null && !email.isBlank() && candidate != null
                && email.trim().toLowerCase(Locale.ROOT).equals(candidate.trim().toLowerCase(Locale.ROOT));
    }
}
```

`OtpStore.java`:

```java
package vn.edu.tvu.auth.otp;

import java.time.Duration;
import java.util.UUID;

public class OtpStore {

    static final Duration TTL = Duration.ofMinutes(10);

    private final Backend backend;
    private final int maxAttempts;

    public OtpStore(Backend backend, int maxAttempts) {
        this.backend = backend;
        this.maxAttempts = maxAttempts;
    }

    public void save(UUID userId, String code) {
        backend.put(key(userId), new Entry(code, 0), TTL);
    }

    /**
     * A consumed, expired and never-issued code are all reported as EXPIRED. The caller turns every
     * outcome into the same 401, so the distinction never reaches a client.
     */
    public Result verify(UUID userId, String code) {
        var key = key(userId);
        var entry = backend.get(key);
        if (entry == null) {
            return Result.EXPIRED;
        }
        if (entry.code().equals(code)) {
            backend.remove(key);
            return Result.OK;
        }
        var attempts = entry.attempts() + 1;
        if (attempts >= maxAttempts) {
            backend.remove(key);
        } else {
            backend.put(key, new Entry(entry.code(), attempts), backend.timeToLive(key));
        }
        return Result.INVALID;
    }

    private String key(UUID userId) {
        return "otp:" + userId;
    }

    public enum Result {
        OK,
        INVALID,
        EXPIRED
    }

    public record Entry(String code, int attempts) {
    }

    /**
     * Narrow seam so the rules above are tested without Redis. The counter shares the code's key, so
     * it expires with the code rather than outliving it.
     */
    public interface Backend {

        void put(String key, Entry entry, Duration ttl);

        Entry get(String key);

        void remove(String key);

        Duration timeToLive(String key);
    }
}
```

`RedisOtpBackend.java` implements `OtpStore.Backend` over `StringRedisTemplate`, serialising an entry as `code + ":" + attempts` and reading the remaining TTL with `getExpire(key)`. Register the store as a bean:

```java
    @Bean
    OtpStore otpStore(StringRedisTemplate redisTemplate) {
        return new OtpStore(new RedisOtpBackend(redisTemplate), 5);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn -B -pl monolith test -Dtest=OtpStoreTest`
Expected: PASS, `Tests run: 2, Failures: 0, Errors: 0, Skipped: 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/monolith/src/main/java/vn/edu/tvu/auth/otp backend/monolith/src/test/java/vn/edu/tvu/auth/otp
git commit -m "feat: issue and store one-time sign-in codes"
```

---

### Task 4: Request and verify a code

**Files:**
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/service/AdminOtpService.java`
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/otp/OtpMailSender.java`
- Create: `backend/monolith/src/main/java/vn/edu/tvu/notification/service/SmtpOtpMailSender.java`
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/dto/request/OtpRequest.java`
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/dto/request/OtpVerifyRequest.java`
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/controller/AuthController.java`
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/security/SecurityConfig.java:37-38`
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/monolith/security/SensitiveFlowRateLimitFilter.java:46-55`
- Test: `backend/monolith/src/test/java/vn/edu/tvu/auth/service/AdminOtpServiceTest.java`

**Interfaces:**
- Consumes: `OtpCodeIssuer`, `OtpStore` from Task 3; `UserRepository.findByEmailAndAuthMethod` from Task 1.
- Produces: `AdminOtpService.requestCode(String email)` returning `void`; `AdminOtpService.verify(String email, String code)` returning `LoginResult`; `OtpMailSender.sendCode(String email, String code)`.

- [ ] **Step 1: Write the failing test**

```java
@Test
void requestCode_sendsNothingForAStudentAddress() {
    when(userRepository.findByEmailAndAuthMethod("student@tvu.edu.vn", AuthMethod.EMAIL_OTP))
            .thenReturn(Optional.empty());

    service.requestCode("student@tvu.edu.vn");

    verify(mailSender, never()).sendCode(any(), any());
    verify(otpStore, never()).save(any(), any());
}

@Test
void verify_rejectsALockedAccountWithoutSayingSo() {
    var admin = User.emailOtpSuperAdmin("admin@tvu.edu.vn", "Admin");
    admin.lock();
    when(userRepository.findByEmailAndAuthMethod("admin@tvu.edu.vn", AuthMethod.EMAIL_OTP))
            .thenReturn(Optional.of(admin));

    assertThatThrownBy(() -> service.verify("admin@tvu.edu.vn", "123456"))
            .isInstanceOf(ResponseStatusException.class)
            .hasMessageContaining("401");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -B -pl monolith test -Dtest=AdminOtpServiceTest`
Expected: FAIL to compile — `cannot find symbol: class AdminOtpService`.

- [ ] **Step 3: Write minimal implementation**

`AdminOtpService.requestCode` looks the address up with `AuthMethod.EMAIL_OTP`, returns silently on a miss or a locked account, and otherwise issues, stores and mails a code. `verify` returns the same `401` for a wrong code, an expired code, a missing account and a locked account, so none of them can be told apart. On success it mints the session exactly as `AuthApplicationService.login` does — extract the existing `sessionFor` into a shared collaborator rather than duplicating it.

`OtpMailSender` is declared in `auth` and implemented in `notification` by `SmtpOtpMailSender`, mirroring `SmtpTicketMailSender`'s use of `JavaMailSender` and `MimeMessageHelper`. This respects the rule in `.claude/rules/architecture.md` that features collaborate through interfaces rather than reaching into one another.

Add both paths to `SecurityConfig`'s `permitAll` list:

```java
                        .requestMatchers("/api/auth/login", "/api/auth/otp/request",
                                "/api/auth/otp/verify", "/.well-known/**", "/actuator/health",
                                "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
```

Extend `SensitiveFlowRateLimitFilter` so `shouldNotFilter` also returns false for `/api/auth/otp/request` and `/api/auth/otp/verify`, and both use `LOGIN_LIMIT`.

Controller methods return `202 ACCEPTED` for the request endpoint and a session for the verify endpoint, both annotated with `@Operation` so `AuthOpenApiIntegrationTest` sees them.

- [ ] **Step 4: Run tests to verify they pass**

Run: `mvn -B -pl monolith test -Dtest='AdminOtpServiceTest,SecurityConfigTest,SensitiveFlowRateLimitFilterTest,AuthOpenApiIntegrationTest'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/monolith/src/main backend/monolith/src/test
git commit -m "feat: sign admins in with a mailed code"
```

---

### Task 5: Remember a verified browser for 30 days

**Files:**
- Create: `backend/monolith/src/main/resources/db/migration/V11__trusted_devices.sql`
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/domain/TrustedDevice.java`
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/repository/TrustedDeviceRepository.java`
- Create: `backend/monolith/src/main/java/vn/edu/tvu/auth/service/TrustedDeviceService.java`
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/security/AuthCookieService.java`
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/controller/AuthController.java`
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/service/AdminManagementService.java`
- Test: `backend/monolith/src/test/java/vn/edu/tvu/auth/service/TrustedDeviceIntegrationTest.java`

**Interfaces:**
- Consumes: `AdminOtpService`, `AuthMethod`, `LoginResult`.
- Produces: `TrustedDeviceService.remember(UUID userId)` returning the raw token `String`; `TrustedDeviceService.exchange(String rawToken)` returning `Optional<UUID>` and rotating; `TrustedDeviceService.revokeAll(UUID userId)`.

- [ ] **Step 1: Write the failing test**

```java
@Test
void exchange_revokesEveryDeviceWhenARotatedTokenComesBack() {
    var admin = userRepository.save(User.emailOtpSuperAdmin("admin@tvu.edu.vn", "Admin"));
    var first = trustedDeviceService.remember(admin.getId());
    var second = trustedDeviceService.remember(admin.getId());

    var rotated = trustedDeviceService.exchange(first).orElseThrow();
    assertThat(rotated).isEqualTo(admin.getId());

    assertThat(trustedDeviceService.exchange(first)).isEmpty();
    assertThat(trustedDeviceService.exchange(second)).isEmpty();
}
```

Presenting a token that has already been rotated away means the cookie was copied, so every device on the account is dropped — including the second, untouched one.

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -B -pl monolith test -Dtest=TrustedDeviceIntegrationTest`
Expected: FAIL to compile — `cannot find symbol: class TrustedDeviceService`.

- [ ] **Step 3: Write minimal implementation**

`V11__trusted_devices.sql`:

```sql
CREATE TABLE trusted_devices (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX ix_trusted_devices_user ON trusted_devices (user_id);
```

`remember` generates 32 random bytes from `SecureRandom`, returns them base64url-encoded, and stores only the SHA-256 hash with `expires_at = now + 30 days`. The raw token exists only in the response cookie.

```java
    @Transactional
    public String remember(UUID userId) {
        var raw = new byte[32];
        random.nextBytes(raw);
        var token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        var now = Instant.now();
        repository.save(new TrustedDevice(userId, hash(token), now, now.plus(LIFETIME)));
        return token;
    }

    /**
     * Rotates on every use. A token that was already rotated away coming back means the cookie was
     * copied, and the legitimate browser has since moved on -- so drop every device on the account
     * rather than just this one.
     */
    @Transactional
    public Optional<UUID> exchange(String rawToken) {
        var device = repository.findByTokenHash(hash(rawToken)).orElse(null);
        if (device == null || device.getExpiresAt().isBefore(Instant.now())) {
            return Optional.empty();
        }
        if (device.getRevokedAt() != null) {
            revokeAll(device.getUserId());
            return Optional.empty();
        }
        device.revoke(Instant.now());
        return Optional.of(device.getUserId());
    }
```

`exchange` returns the user id; the caller then calls `remember` again to mint the replacement cookie, so rotation and issuance stay in one place.

Add a device cookie to `AuthCookieService` with `httpOnly = true` and a 30-day `maxAge`, and clear it in `logoutCookies()`. Add `POST /api/auth/session/refresh` to `AuthController`, reading the cookie and minting a new session; it must reject any user whose `authMethod` is not `EMAIL_OTP`. Call `trustedDeviceService.revokeAll` from `lockOrganizer` alongside the existing `tokenRevocationService.revoke`.

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn -B -pl monolith test -Dtest=TrustedDeviceIntegrationTest`
Expected: PASS, `Skipped: 0`. A skip means Docker is not running; start it and re-run.

- [ ] **Step 5: Commit**

```bash
git add backend/monolith/src/main backend/monolith/src/test
git commit -m "feat: remember a verified browser for 30 days"
```

---

### Task 6: Keep the demo account out of production

**Files:**
- Modify: `backend/monolith/src/main/java/vn/edu/tvu/auth/config/ProductionSecretsValidator.java`
- Modify: `backend/monolith/src/main/resources/application-dev.yml:23-24`
- Modify: `backend/monolith/src/main/resources/application.yml`
- Modify: `.github/workflows/ci.yml`
- Test: `backend/monolith/src/test/java/vn/edu/tvu/auth/config/ProductionSecretsValidatorTest.java`

**Interfaces:**
- Consumes: `DemoOtpProperties` from Task 3.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

```java
@Test
void rejectsDemoOtpConfigurationInProduction() {
    var validator = new ProductionSecretsValidator(validCsrf(), validJwt(),
            new DemoOtpProperties("sadminevt@tvu.edu.vn", "123456"));

    assertThatThrownBy(validator::validate)
            .isInstanceOf(IllegalStateException.class)
            .hasMessageContaining("tvu.auth.demo-otp");
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mvn -B -pl monolith test -Dtest=ProductionSecretsValidatorTest#rejectsDemoOtpConfigurationInProduction`
Expected: FAIL — the constructor does not take `DemoOtpProperties`.

- [ ] **Step 3: Write minimal implementation**

Add the property to the validator and throw when either field is set:

```java
        if (demoOtpProperties != null
                && (hasText(demoOtpProperties.email()) || hasText(demoOtpProperties.code()))) {
            throw new IllegalStateException("tvu.auth.demo-otp must not be configured in production; "
                    + "it is a development convenience with a fixed code committed to this repository");
        }
```

In `application-dev.yml`, point the bootstrap address at the demo account and add the demo code:

```yaml
    bootstrap:
      email: ${BOOTSTRAP_ADMIN_EMAIL:sadminevt@tvu.edu.vn}
    demo-otp:
      email: sadminevt@tvu.edu.vn
      code: "123456"
```

Leave `application-prod.yml` with `email: ${BOOTSTRAP_ADMIN_EMAIL}` and **no** `demo-otp` block. Add a CI step next to the existing frontend guard:

```yaml
      - name: Fail if demo credentials reached production config
        working-directory: backend
        run: |
          if grep -rniE "sadminevt|123456" monolith/src/main/resources/application-prod.yml; then
            echo "Demo sign-in credentials must never appear in production configuration."
            exit 1
          fi
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mvn -B -pl monolith test -Dtest=ProductionSecretsValidatorTest`
Expected: PASS, `Tests run: 5, Failures: 0, Errors: 0, Skipped: 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/monolith/src/main backend/monolith/src/test .github/workflows/ci.yml
git commit -m "chore: keep demo sign-in credentials out of production"
```

---

### Task 7: Write the break-glass runbook

**Files:**
- Modify: `backend/docs/OPERATIONS.md`

**Interfaces:**
- Consumes: the `users` schema from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the section**

Append a section titled "Restoring a locked-out super admin" containing the reasoning and this SQL:

```sql
-- Point an existing super admin at a mailbox you can read.
UPDATE users
   SET email = 'reachable@example.com', status = 'ACTIVE'
 WHERE role = 'SUPER_ADMIN';

-- Or create one from nothing.
INSERT INTO users (id, ext_subject, email, display_name, role, status, auth_method,
                   mssv_status, version, created_at, updated_at)
VALUES (gen_random_uuid(), NULL, 'reachable@example.com', 'Recovery Admin',
        'SUPER_ADMIN', 'ACTIVE', 'EMAIL_OTP', 'UNVERIFIED', 0, now(), now());
```

State plainly that sign-in is passwordless, so the only requirement is that the address receives mail, and that this procedure must be rehearsed against production before the migration runs — an untested runbook is not a recovery plan.

- [ ] **Step 2: Commit**

```bash
git add backend/docs/OPERATIONS.md
git commit -m "docs: add break-glass recovery for a locked-out super admin"
```

---

### Task 8: Two sign-in boxes in the UI

**Files:**
- Modify: `frontend/src/pages/public/LoginPage.tsx`
- Modify: `frontend/src/services/authService.ts`
- Modify: `frontend/src/services/apiClient.ts:147`
- Modify: `frontend/src/types/auth.ts`
- Modify: `frontend/.env.example`
- Test: `frontend/src/services/__tests__/authService.test.ts`
- Test: `frontend/src/pages/public/__tests__/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/otp/request`, `POST /api/auth/otp/verify`, `POST /api/auth/session/refresh` from Tasks 4 and 5.
- Produces: `authService.requestOtp(email)`, `authService.verifyOtp(email, code, rememberDevice)`, `authService.refreshSession()`.

- [ ] **Step 1: Write the failing test**

```typescript
it("sends the code request without leaking whether the address exists", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchMock);

  await expect(authService.requestOtp("admin@tvu.edu.vn")).resolves.toBeUndefined();

  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][0]).toContain("/auth/otp/request");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/services/__tests__/authService.test.ts`
Expected: FAIL — `authService.requestOtp is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add the three service functions. Render two panels on the login page: the student panel keeps the existing Microsoft button, and the admin panel takes an address, then a six-digit code, with a "ghi nhớ thiết bị này" checkbox. On `401`, `apiClient` attempts `POST /api/auth/session/refresh` once and retries the original request before surfacing "Phiên đăng nhập đã hết hạn."

Update the `VITE_AUTH_PROVIDER` comment in `frontend/.env.example`: it now selects only the **student** panel's provider (`microsoft` or `devstub`); the admin panel is always the emailed code and cannot be switched off.

- [ ] **Step 4: Run the frontend checks**

Run: `cd frontend && npm run typecheck && npm run lint && npx vitest run`
Expected: typecheck clean, lint no new warnings, the new test passing. Eight pre-existing failures in `eventService.test.ts` and `ticketService.test.ts` are a local Node 26 `localStorage` problem, not a regression — CI runs Node 22 and passes them.

- [ ] **Step 5: Commit**

```bash
git add frontend/src frontend/.env.example
git commit -m "feat: add the admin sign-in panel"
```

---

## Final verification

- [ ] Run the whole backend suite: `mvn -B -pl monolith -am clean verify` from `backend/`. Expect `Failures: 0, Errors: 0, Skipped: 0` and `BUILD SUCCESS`.
- [ ] Run the frontend build: `cd frontend && npm run build`.
- [ ] Start the stack and sign in as `sadminevt@tvu.edu.vn` with `123456`, confirm the session survives a browser reload, and confirm an Entra login using a club account's address creates a separate student rather than reaching the club.
- [ ] Re-read the "Deploy blockers" section of the spec and confirm every item is either done or recorded as outstanding.
