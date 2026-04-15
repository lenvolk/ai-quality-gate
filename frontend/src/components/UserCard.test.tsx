import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserCard, User } from "./UserCard";

const mockUser: User = {
  id: 1,
  name: "Alice Johnson",
  email: "alice@example.com",
  role: "admin",
};

describe("UserCard component", () => {
  it("renders user name", () => {
    render(<UserCard user={mockUser} />);
    expect(screen.getByTestId("user-name")).toHaveTextContent("Alice Johnson");
  });

  it("renders email when showEmail is true (default)", () => {
    render(<UserCard user={mockUser} />);
    expect(screen.getByTestId("user-email")).toHaveTextContent("alice@example.com");
  });

  it("hides email when showEmail is false", () => {
    render(<UserCard user={mockUser} showEmail={false} />);
    expect(screen.queryByTestId("user-email")).not.toBeInTheDocument();
  });

  it("renders admin role badge", () => {
    render(<UserCard user={mockUser} />);
    expect(screen.getByTestId("user-role")).toHaveTextContent("🔴 Admin");
  });

  it("renders user role badge", () => {
    const user: User = { ...mockUser, role: "user" };
    render(<UserCard user={user} />);
    expect(screen.getByTestId("user-role")).toHaveTextContent("🟢 User");
  });

  it("renders guest role badge", () => {
    const user: User = { ...mockUser, role: "guest" };
    render(<UserCard user={user} />);
    expect(screen.getByTestId("user-role")).toHaveTextContent("⚪ Guest");
  });

  it("renders delete button when onDelete is provided", () => {
    const onDelete = vi.fn();
    render(<UserCard user={mockUser} onDelete={onDelete} />);
    expect(screen.getByTestId("delete-button")).toBeInTheDocument();
  });

  it("does not render delete button when onDelete is not provided", () => {
    render(<UserCard user={mockUser} />);
    expect(screen.queryByTestId("delete-button")).not.toBeInTheDocument();
  });

  it("calls onDelete with user id when delete button is clicked", () => {
    const onDelete = vi.fn();
    render(<UserCard user={mockUser} onDelete={onDelete} />);
    
    fireEvent.click(screen.getByTestId("delete-button"));
    expect(onDelete).toHaveBeenCalledWith(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("renders correct test id based on user id", () => {
    render(<UserCard user={mockUser} />);
    expect(screen.getByTestId("user-card-1")).toBeInTheDocument();
  });

  it("has accessible delete button label", () => {
    const onDelete = vi.fn();
    render(<UserCard user={mockUser} onDelete={onDelete} />);
    expect(screen.getByLabelText("Delete Alice Johnson")).toBeInTheDocument();
  });
});
