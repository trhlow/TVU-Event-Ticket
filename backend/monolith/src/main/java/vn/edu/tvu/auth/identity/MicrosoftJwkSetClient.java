package vn.edu.tvu.auth.identity;

import com.nimbusds.jose.jwk.JWKSet;

public interface MicrosoftJwkSetClient {

    /**
     * @param forceRefresh bypass any cached copy. Callers pass {@code true} only after a key id they need
     *                     turned out to be absent, which is what a Microsoft key rotation looks like from
     *                     here — otherwise a stale cache would break every login until it expired.
     */
    JWKSet fetch(boolean forceRefresh);

    default JWKSet fetch() {
        return fetch(false);
    }
}
