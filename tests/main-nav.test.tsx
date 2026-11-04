import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MainNav } from "@/components/main-nav";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));

describe("MainNav authentication states", () => {
  it("shows only public destinations to logged-out visitors", () => {
    render(<MainNav user={null} />);
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Register" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Dashboard" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Log out" }),
    ).not.toBeInTheDocument();
  });

  it("removes login and registration for authenticated users", () => {
    render(<MainNav user={{ email: "owner@example.com" }} />);
    for (const name of [
      "Home",
      "Pets",
      "Photos",
      "Albums",
      "Upload",
      "Review Queue",
    ])
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Log in" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Register" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Signed in as owner@example.com" }),
    ).toHaveTextContent("OW");
  });

  it("marks Upload without also marking Photos and shows the real review count", () => {
    navigation.pathname = "/photos/upload";
    render(<MainNav user={{ email: "owner@example.com" }} reviewCount={3} />);
    expect(screen.getByRole("link", { name: "Upload" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Photos" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByLabelText("3 photos need review")).toHaveTextContent(
      "3",
    );
    expect(
      screen.queryByRole("link", { name: "Settings" }),
    ).not.toBeInTheDocument();
    navigation.pathname = "/dashboard";
  });
});
