package vn.edu.tvu.ticket.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * RFC 4180 quoting stops a value from breaking out of its <em>cell</em>; it does nothing about the cell
 * being interpreted as a <em>formula</em>. Excel and LibreOffice parse a leading {@code = + - @} (and a
 * leading tab or CR) as the start of an expression even inside quotes, so an attendee-supplied MSSV can
 * execute in the organizer's spreadsheet when they open the export.
 */
class CsvCellTest {

    @ParameterizedTest
    @ValueSource(strings = {"=cmd|'/c calc'!A1", "+1+1", "-1+1", "@SUM(A1)", "\tlead", "\rlead"})
    void formulaLeadingCharactersAreNeutralised(String dangerous) {
        var cell = TicketingService.csvCell(dangerous);

        assertThat(cell).startsWith("\"'");
        assertThat(cell).isEqualTo("\"'" + dangerous + "\"");
    }

    @Test
    void ordinaryValuesAreUnchanged() {
        assertThat(TicketingService.csvCell("110120001")).isEqualTo("\"110120001\"");
        assertThat(TicketingService.csvCell("student@tvu.edu.vn")).isEqualTo("\"student@tvu.edu.vn\"");
    }

    @Test
    void embeddedQuotesAreStillDoubled() {
        assertThat(TicketingService.csvCell("say \"hi\"")).isEqualTo("\"say \"\"hi\"\"\"");
    }

    @Test
    void nullBecomesEmpty() {
        assertThat(TicketingService.csvCell(null)).isEmpty();
    }
}
