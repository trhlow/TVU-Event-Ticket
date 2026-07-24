package vn.edu.tvu.auth.otp;

public interface OtpCodeIssuer {

    String issue(String email);
}
