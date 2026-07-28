package vn.edu.tvu.shared.audit;

import java.util.LinkedHashMap;
import java.util.Map;

import tools.jackson.databind.ObjectMapper;

/**
 * Builds the JSON stored in {@code audit_log.detail}.
 *
 * <p>These values were previously assembled by string concatenation — {@code "{\"name\":\"" +
 * club.getName() + "\"}"}. Club names and email addresses are typed by users, so a single quote
 * character produced invalid JSON, and a more deliberate string could inject extra fields into the
 * record. An audit log is evidence; evidence the subject of the audit can edit is worth very little.
 */
public final class AuditDetail {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AuditDetail() {
    }

    /** An empty detail object. */
    public static String empty() {
        return "{}";
    }

    /**
     * @param keyValues alternating key and value; values may be null and are serialised, never
     *                  spliced into a string.
     */
    public static String of(Object... keyValues) {
        if (keyValues.length % 2 != 0) {
            throw new IllegalArgumentException("Audit detail needs matching key/value pairs");
        }
        Map<String, Object> detail = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            detail.put(String.valueOf(keyValues[i]), keyValues[i + 1]);
        }
        return MAPPER.writeValueAsString(detail);
    }
}
