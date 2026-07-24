package vn.edu.tvu.monolith.stats;

import java.util.List;

public record ClubStatsDetail(ClubStatsSummary summary, List<DailyPoint> last30Days) {
}
