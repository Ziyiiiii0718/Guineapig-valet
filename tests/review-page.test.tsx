import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ReviewPage from "@/app/review/page";
import Loading from "@/app/review/loading";
const mocks = vi.hoisted(() => ({
  queue: vi.fn(),
  direct: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("@/lib/ai/prediction-queries", () => ({
  listReviewQueue: mocks.queue,
  getReviewForPhoto: mocks.direct,
}));
vi.mock("@/lib/pets/queries", () => ({
  requireAuthenticatedSupabase: mocks.auth,
}));
vi.mock("@/components/ai/review-prediction-form", () => ({
  ReviewPredictionForm: ({ photoId }: { photoId: string }) => (
    <div>Manual editor {photoId}</div>
  ),
}));
vi.mock("@/components/ai/analyze-photo-form", () => ({
  AnalyzePhotoForm: () => null,
}));
vi.mock("@/components/photos/photo-name-editor", () => ({
  PhotoNameEditor: () => null,
}));
const photoId = "10000000-0000-4000-8000-000000000001";
const cursor = {
  created_at: "2026-01-01T00:00:00Z",
  id: photoId,
  direction: "older",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    envStatus: { isConfigured: true },
    user: { id: "owner" },
  });
  mocks.queue.mockResolvedValue({
    items: [],
    pets: [],
    error: null,
    nextCursor: cursor,
    previousCursor: null,
  });
  mocks.direct.mockResolvedValue({
    photo: { id: photoId },
    prediction: null,
    pets: [],
    error: null,
  });
});
it("uses direct lookup independently of cursor/filter and offers manual labels without AI", async () => {
  render(
    await ReviewPage({
      searchParams: Promise.resolve({
        photo: photoId,
        filter: "failed",
        cursor: JSON.stringify(cursor),
      }),
    }),
  );
  expect(mocks.direct).toHaveBeenCalledWith(photoId, "owner");
  expect(mocks.queue).not.toHaveBeenCalled();
  expect(screen.getByText(`Manual editor ${photoId}`)).toBeVisible();
  expect(
    screen.queryByLabelText("Review queue pagination"),
  ).not.toBeInTheDocument();
});
it("uses validated cursors and resets pagination when filters change", async () => {
  render(
    await ReviewPage({
      searchParams: Promise.resolve({
        filter: "corrected",
        cursor: JSON.stringify(cursor),
      }),
    }),
  );
  expect(mocks.queue).toHaveBeenCalledWith("owner", "corrected", cursor);
  expect(
    screen.getByRole("link", { name: "Next page" }).getAttribute("href"),
  ).toContain("filter=corrected");
  expect(screen.getByRole("link", { name: "Failed" })).toHaveAttribute(
    "href",
    "/review?filter=failed",
  );
  expect(
    screen.getByRole("link", { name: "First page / refresh" }),
  ).toBeVisible();
});
it("gives unauthorized and missing photos the same unavailable state", async () => {
  mocks.direct.mockResolvedValue({
    photo: null,
    prediction: null,
    pets: [],
    error: null,
  });
  render(
    await ReviewPage({ searchParams: Promise.resolve({ photo: photoId }) }),
  );
  expect(
    screen.getByText("This photo is unavailable or you do not have access."),
  ).toBeVisible();
  expect(
    screen.queryByText(`Manual editor ${photoId}`),
  ).not.toBeInTheDocument();
});
it("does not fall back to the queue for invalid direct IDs", async () => {
  render(
    await ReviewPage({ searchParams: Promise.resolve({ photo: "invalid" }) }),
  );
  expect(mocks.queue).not.toHaveBeenCalled();
  expect(mocks.direct).not.toHaveBeenCalled();
});
it("shows query errors without misleading empty state or continuation links", async () => {
  mocks.queue.mockResolvedValue({
    items: [],
    pets: [],
    error: {},
    nextCursor: cursor,
    previousCursor: null,
  });
  render(await ReviewPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.queryByText("Nothing here right now")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "Next page" }),
  ).not.toBeInTheDocument();
});
it("provides a loading status", () => {
  render(<Loading />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading photo reviews");
});
