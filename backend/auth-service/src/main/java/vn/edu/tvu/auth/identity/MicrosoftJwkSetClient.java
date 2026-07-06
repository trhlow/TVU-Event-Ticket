package vn.edu.tvu.auth.identity;

import com.nimbusds.jose.jwk.JWKSet;

public interface MicrosoftJwkSetClient {

    JWKSet fetch();
}
