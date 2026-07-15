package vn.edu.tvu.auth.dto.response;

import vn.edu.tvu.auth.domain.UserRole;

import java.util.Map;

public record AdminStatsResponse(long totalClubs, long totalUsers, Map<UserRole, Long> usersByRole) {
}
