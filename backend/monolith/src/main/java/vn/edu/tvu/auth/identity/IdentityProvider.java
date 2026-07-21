package vn.edu.tvu.auth.identity;

public interface IdentityProvider {

    ExternalIdentity verify(String externalCredential);
}
