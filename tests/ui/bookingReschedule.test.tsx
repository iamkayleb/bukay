// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { BookingCalendar } from "@/app/(app)/calendar/components/booking-calendar";

type Booking = {
  id: string;
  serviceId: string;
  staffId: string | null;
  clientId: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  status?: string | null;
  clientName?: string;
  serviceName?: string;
  staffName?: string | null;
};

const services = [
  { id: "svc-1", name: "Haircut", durationMinutes: 30, active: true },
];
const staff = [{ id: "staff-1", name: "Alice", active: true }];

const initialBooking: Booking = {
  id: "booking-1",
  serviceId: "svc-1",
  staffId: "staff-1",
  clientId: "client-1",
  startsAt: "2026-07-15T10:00:00.000Z",
  endsAt: "2026-07-15T10:30:00.000Z",
  status: "confirmed",
  notes: null,
  clientName: "Ada",
  serviceName: "Haircut",
  staffName: "Alice",
};

const fetchMock = vi.fn();

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

function renderCalendar() {
  return render(
    <BookingCalendar
      services={services}
      staff={staff}
      initialBookings={[{ ...initialBooking }]}
    />,
  );
}

function getBookingButton(id: string): HTMLElement {
  const buttons = screen.getAllByTestId(`booking-${id}`);
  // If the same booking renders in multiple views, pick the first non-hidden one.
  return buttons[0];
}

// Drop coordinates: with defaults openingHour=7 and slotMinutes=30,
// row 6 == 10:00, row 14 == 14:00. We anchor the calendar to 2026-07-15.
function fireHtml5Drop(bookingId: string, slotIndex: number) {
  const button = getBookingButton(bookingId);
  const data = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: "" as string,
    dropEffect: "" as string,
    setData: (key: string, value: string) => data.set(key, value),
    getData: (key: string) => data.get(key) ?? "",
    types: [] as string[],
  } as unknown as DataTransfer;

  fireEvent.dragStart(button, { dataTransfer });
  const slot = screen.getByTestId(`slot-0-${slotIndex}`);
  fireEvent.dragOver(slot, { dataTransfer });
  fireEvent.drop(slot, { dataTransfer });
  fireEvent.dragEnd(button, { dataTransfer });
}

beforeEach(() => {
  // Freeze the "wall clock" so BookingCalendar's default anchorDate lands on
  // 2026-07-15 (the day of `initialBooking`). Only Date is faked so
  // testing-library's `findBy*` queries keep working with real setTimeout.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
  fetchMock.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchMock;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BookingCalendar drag-and-drop reschedule", () => {
  it("optimistically moves the booking, sends PATCH, and persists on success", async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      expect(url).toBe(`/api/bookings/${initialBooking.id}`);
      expect(init.method).toBe("PATCH");
      const body = JSON.parse(String(init.body));
      expect(body).toEqual({ startsAt: "2026-07-15T14:00:00.000Z" });
      return jsonResponse({
        ok: true,
        booking: {
          ...initialBooking,
          startsAt: "2026-07-15T14:00:00.000Z",
          endsAt: "2026-07-15T14:30:00.000Z",
        },
      });
    });

    renderCalendar();

    await act(async () => {
      fireHtml5Drop(initialBooking.id, 14); // 14 => 07:00 + 14*30min = 14:00
    });

    // Optimistic block placement — the button now sits in the row for 14:00.
    // We assert on the gridRow style since the DOM writes it inline.
    const button = getBookingButton(initialBooking.id);
    expect(button.getAttribute("style")).toMatch(/grid-row:\s*16/); // header row + 14 offset + 2

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Toast appears on success.
    const toast = await screen.findByRole("status");
    expect(toast.textContent ?? "").toMatch(/rescheduled/i);

    // Upcoming list reflects the new time (formatted range includes 14:).
    const list = screen.getByLabelText("Bookings list");
    expect(within(list).getAllByText(/Ada/).length).toBeGreaterThan(0);
  });

  it("reverts the block and shows an error toast when the server rejects the drop", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: "booking_conflict" }, { status: 409 }));

    renderCalendar();

    const before = getBookingButton(initialBooking.id).getAttribute("style");

    await act(async () => {
      fireHtml5Drop(initialBooking.id, 14);
    });

    // Flush the microtask fetch resolution.
    await act(async () => {
      await Promise.resolve();
    });

    const after = getBookingButton(initialBooking.id).getAttribute("style");
    expect(after).toBe(before);

    const toast = await screen.findByRole("status");
    expect(toast.textContent ?? "").toMatch(/overlap/i);
  });

  it("shows a network-failure toast and reverts when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    renderCalendar();
    const before = getBookingButton(initialBooking.id).getAttribute("style");

    await act(async () => {
      fireHtml5Drop(initialBooking.id, 14);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const after = getBookingButton(initialBooking.id).getAttribute("style");
    expect(after).toBe(before);

    const toast = await screen.findByRole("status");
    expect(toast.textContent ?? "").toMatch(/reach the server/i);
  });

  it("only persists edits from the modal after Save is clicked, and reflects the change", async () => {
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      expect(url).toBe(`/api/bookings/${initialBooking.id}`);
      expect(init.method).toBe("PATCH");
      const body = JSON.parse(String(init.body));
      expect(body.notes).toBe("Bring shampoo");
      return jsonResponse({
        ok: true,
        booking: {
          ...initialBooking,
          notes: "Bring shampoo",
        },
      });
    });

    renderCalendar();

    // Open modal by clicking the booking (click, not drag).
    fireEvent.click(getBookingButton(initialBooking.id));

    const dialog = await screen.findByRole("dialog");
    // No fetch fired yet — the modal is just open.
    expect(fetchMock).not.toHaveBeenCalled();

    const notes = within(dialog).getByLabelText(/Notes/i) as HTMLTextAreaElement;
    fireEvent.change(notes, { target: { value: "Bring shampoo" } });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /^Save$/i }));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // After save, the modal closes and the notes update flows into the list.
    expect(screen.queryByRole("dialog")).toBeNull();
    const list = screen.getByLabelText("Bookings list");
    expect(within(list).getByText("Bring shampoo")).toBeTruthy();
  });
});
