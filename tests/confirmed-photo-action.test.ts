import { describe, expect, it, vi } from "vitest";
import { withConfirmedPhotoRefresh } from "@/lib/photos/confirmed-action";

describe("confirmed photo refresh", () => {
  it("waits for confirmed success, forwards the original input, then refreshes once", async () => {
    let resolve!: (value: { status: string }) => void;
    const action = vi.fn(
      () =>
        new Promise<{ status: string }>((done) => {
          resolve = done;
        }),
    );
    const refresh = vi.fn();
    const previous = { status: "idle" };
    const data = new FormData();
    const pending = withConfirmedPhotoRefresh<{
      status: string;
      message?: string;
    }>(action, refresh)(previous, data);
    expect(action).toHaveBeenCalledExactlyOnceWith(previous, data);
    expect(refresh).not.toHaveBeenCalled();
    const result = { status: "success" };
    resolve(result);
    await expect(pending).resolves.toBe(result);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("preserves inline errors without refreshing or retrying", async () => {
    const result = { status: "error", message: "Refresh before saving again." };
    const action = vi.fn(async () => result);
    const refresh = vi.fn();
    await expect(
      withConfirmedPhotoRefresh<{ status: string; message?: string }>(
        action,
        refresh,
      )({ status: "idle" }, new FormData()),
    ).resolves.toBe(result);
    expect(refresh).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("does not refresh or retry an uncertain rejected action", async () => {
    const error = new Error("Connection lost");
    const action = vi.fn(async () => {
      throw error;
    });
    const refresh = vi.fn();
    await expect(
      withConfirmedPhotoRefresh<{ status: string; message?: string }>(
        action,
        refresh,
      )({ status: "idle" }, new FormData()),
    ).rejects.toBe(error);
    expect(refresh).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
  });
});
