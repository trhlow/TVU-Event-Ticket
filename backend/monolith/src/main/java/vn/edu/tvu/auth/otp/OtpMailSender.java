package vn.edu.tvu.auth.otp;

/**
 * Declared here in {@code auth} and implemented in {@code notification}: login needs to send a code, but
 * the two features collaborate through an interface rather than one reaching into the other.
 */
public interface OtpMailSender {

    void sendCode(String email, String code);
}
