import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MainNav } from "@/components/main-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
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
    for (const name of ["Dashboard", "Pets", "Photos", "Albums", "Upload"])
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
});
