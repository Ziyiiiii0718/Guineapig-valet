import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhotoNameEditor } from "@/components/photos/photo-name-editor";

vi.mock("@/app/actions/photos", () => ({
  updatePhotoDisplayNameAction: vi.fn(),
}));

describe("photo name editor", () => {
  it("opens with input focus and cancels with Escape", async () => {
    render(
      <PhotoNameEditor
        displayName="IMG_3847"
        hasCustomName={false}
        photoId="550e8400-e29b-41d4-a716-446655440000"
      />,
    );
    const editButton = screen.getByRole("button", {
      name: "Edit photo name IMG_3847",
    });

    fireEvent.click(editButton);
    const input = screen.getByRole("textbox", { name: "Photo name" });
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: "Escape" });

    expect(
      screen.queryByRole("textbox", { name: "Photo name" }),
    ).not.toBeInTheDocument();
    await vi.waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Edit photo name IMG_3847" }),
      ).toHaveFocus(),
    );
  });

  it("shows explicit reset only when a custom name exists", () => {
    render(
      <PhotoNameEditor
        displayName="Annie eating hay"
        hasCustomName
        photoId="550e8400-e29b-41d4-a716-446655440000"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit photo name Annie eating hay",
      }),
    );

    expect(
      screen.getByRole("button", { name: "Reset to original filename" }),
    ).toBeInTheDocument();
  });
});
