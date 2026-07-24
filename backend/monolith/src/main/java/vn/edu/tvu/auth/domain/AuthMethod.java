package vn.edu.tvu.auth.domain;

/**
 * How an account proves who it is. The role decides this, not the person signing in: students hold
 * Entra accounts the university issues, while clubs do not and reach their shared account through a
 * mailed code instead. Binding one method per account keeps either flow from being a way into the
 * other's accounts.
 */
public enum AuthMethod {
    MICROSOFT,
    EMAIL_OTP
}
