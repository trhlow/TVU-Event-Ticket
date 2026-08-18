import { useEffect, useState } from "react";
import { ticketService } from "../services/ticketService";

export interface TicketQrState {
  /** The signed payload, or null while loading or after a refusal. */
  value: string | null;
  /** When the code stops being accepted. Null until it is known. */
  expiresAt: string | null;
  isLoading: boolean;
  /** True once the fetch has failed. The caller shows the email fallback rather than an error. */
  failed: boolean;
}

/**
 * Fetches the signed check-in payload for one ticket.
 *
 * <p>One hook rather than the same effect in two pages: both the wallet drawer and the ticket
 * detail page need the code, and a second copy of this would be a second place to forget the
 * cleanup flag when the student navigates away mid-request.
 *
 * <p>A failure is a state, not a throw. The email is still the primary delivery path, so a refusal
 * here means "we could not re-issue it, go and look in your inbox" — which is exactly what the card
 * already says when it has no payload.
 */
export function useTicketQr(ticketId: string | null | undefined): TicketQrState {
  const [state, setState] = useState<TicketQrState>({
    value: null,
    expiresAt: null,
    isLoading: Boolean(ticketId),
    failed: false,
  });

  useEffect(() => {
    if (!ticketId) {
      setState({ value: null, expiresAt: null, isLoading: false, failed: false });
      return;
    }

    let active = true;
    setState({ value: null, expiresAt: null, isLoading: true, failed: false });

    ticketService
      .fetchQr(ticketId)
      .then((qr) => {
        if (!active) return;
        setState({ value: qr.payload, expiresAt: qr.expiresAt, isLoading: false, failed: false });
      })
      .catch(() => {
        if (!active) return;
        setState({ value: null, expiresAt: null, isLoading: false, failed: true });
      });

    return () => {
      // Without this, switching tickets quickly lets a slower earlier response land last and paint
      // one ticket's code onto another ticket's card.
      active = false;
    };
  }, [ticketId]);

  return state;
}
