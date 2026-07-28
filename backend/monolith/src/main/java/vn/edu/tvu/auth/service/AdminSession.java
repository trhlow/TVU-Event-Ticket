package vn.edu.tvu.auth.service;

/**
 * The outcome of an admin sign-in: the session to set, and a device token to remember the browser with
 * when asked. {@code deviceToken} is null when the caller did not opt in.
 */
/**
 * @param deviceExpiresAt when the device token stops working, so the cookie can be given a matching
 *                        Max-Age instead of a fixed 30 days. Null when no device was remembered.
 */
public record AdminSession(LoginResult session, String deviceToken, java.time.Instant deviceExpiresAt) {
}
