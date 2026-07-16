package vn.edu.tvu.auth.web;

import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class PageableFactory {

    public static final int MAX_PAGE_SIZE = 100;

    private PageableFactory() {
    }

    public static Pageable of(int page, int size, String sort, Map<String, String> sortWhitelist,
            String defaultSort) {
        if (page < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "page must not be negative");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "size must be between 1 and " + MAX_PAGE_SIZE);
        }
        return PageRequest.of(page, size, parseSort(sort == null || sort.isBlank() ? defaultSort : sort,
                sortWhitelist));
    }

    private static Sort parseSort(String sort, Map<String, String> whitelist) {
        var parts = sort.split(",");
        var mapped = whitelist.get(parts[0].trim());
        if (mapped == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "sort field must be one of " + whitelist.keySet());
        }
        var direction = parts.length > 1 && "desc".equalsIgnoreCase(parts[1].trim())
                ? Sort.Direction.DESC
                : Sort.Direction.ASC;
        return Sort.by(direction, mapped);
    }
}
