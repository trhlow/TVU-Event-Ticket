package vn.edu.tvu.auth.service;

/**
 * The outcome of an admin sign-in: the session to set, and a device token to remember the browser with
 * when asked. {@code deviceToken} is null when the caller did not opt in.
 */
public record AdminSession(LoginResult session, String deviceToken) {
}
