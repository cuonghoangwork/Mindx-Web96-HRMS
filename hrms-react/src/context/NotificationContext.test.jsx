import "../i18n";
import { act, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useStore } from "./StoreContext";
import { useNotifications } from "./NotificationContext";
import { renderWithProviders, USERS } from "../test/renderWithProviders";

vi.mock("../api", async (importOriginal) => {
  const { mockAllApis } = await import("../test/apiMock");
  return mockAllApis(importOriginal);
});

vi.mock("../api/notificationStream", async () => {
  const { mockNotificationStream } = await import("../test/apiMock");
  return mockNotificationStream();
});

/**
 * The regression guard for Phase 2's whole premise.
 *
 * Splitting a context buys nothing unless consumers of the OTHER context stop
 * re-rendering. That property is invisible in ordinary tests — everything
 * still renders the right thing either way — and it is destroyed by a
 * one-line change: having useStore() read NotificationContext, whether to
 * merge the two during a migration or by accident later.
 *
 * So this asserts the render behaviour directly. Before the split, an arriving
 * notification rebuilt the 74-field store value and re-rendered all 25
 * consumers. After it, a store consumer must not re-render at all.
 */

const renders = { store: 0, notifications: 0 };

function StoreProbe() {
  // Renders its loading flag so a test can wait for the store's own async load
  // to finish. Without that gate the counter is racy: refreshAll can resolve
  // AFTER the notification probe first paints, adding a store render that has
  // nothing to do with the notification under test.
  const { loadingStore } = useStore();
  renders.store += 1;
  return <span data-testid="store-state">{loadingStore ? "loading" : "ready"}</span>;
}

function NotificationProbe() {
  const { notifications } = useNotifications();
  renders.notifications += 1;
  return <span data-testid="notif-count">{notifications.length}</span>;
}

async function emitNotification(notification) {
  const { connectNotificationStream } = await import("../api/notificationStream");
  const { onNotification } = connectNotificationStream.mock.calls.at(-1)[0];
  await act(async () => {
    onNotification(notification);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  renders.store = 0;
  renders.notifications = 0;
});

describe("notification updates are isolated from the store", () => {
  it("re-renders notification consumers but not store consumers", async () => {
    renderWithProviders(
      <>
        <StoreProbe />
        <NotificationProbe />
      </>,
      { user: USERS.ADMIN, store: { employees: [] } },
    );

    // Let BOTH initial loads settle so the counters measure the SSE event and
    // not the mount.
    await waitFor(() => expect(screen.getByTestId("store-state")).toHaveTextContent("ready"));
    await waitFor(() => expect(screen.getByTestId("notif-count")).toHaveTextContent("0"));
    const storeRendersBefore = renders.store;
    const notificationRendersBefore = renders.notifications;

    await emitNotification({ id: "n1", title: "Leave approved", read: false });

    expect(screen.getByTestId("notif-count")).toHaveTextContent("1");
    expect(renders.notifications).toBeGreaterThan(notificationRendersBefore);
    // The assertion this whole file exists for.
    expect(renders.store).toBe(storeRendersBefore);
  });

  it("stays isolated across several notifications", async () => {
    renderWithProviders(
      <>
        <StoreProbe />
        <NotificationProbe />
      </>,
      { user: USERS.ADMIN, store: { employees: [] } },
    );
    await waitFor(() => expect(screen.getByTestId("store-state")).toHaveTextContent("ready"));
    await waitFor(() => expect(screen.getByTestId("notif-count")).toHaveTextContent("0"));
    const storeRendersBefore = renders.store;

    await emitNotification({ id: "n1", title: "One", read: false });
    await emitNotification({ id: "n2", title: "Two", read: false });
    await emitNotification({ id: "n3", title: "Three", read: false });

    expect(screen.getByTestId("notif-count")).toHaveTextContent("3");
    expect(renders.store).toBe(storeRendersBefore);
  });

  it("still dedupes a notification the stream delivers twice", async () => {
    // Behaviour carried over from StoreProvider: a reconnect's catch-up fetch
    // and a live event can both carry the same row.
    renderWithProviders(<NotificationProbe />, { user: USERS.ADMIN, store: {} });
    await waitFor(() => expect(screen.getByTestId("notif-count")).toHaveTextContent("0"));

    await emitNotification({ id: "n1", title: "Once", read: false });
    await emitNotification({ id: "n1", title: "Once", read: false });

    expect(screen.getByTestId("notif-count")).toHaveTextContent("1");
  });
});
