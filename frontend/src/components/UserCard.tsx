import React from "react";

export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user" | "guest";
}

export interface UserCardProps {
  user: User;
  onDelete?: (id: number) => void;
  showEmail?: boolean;
}

function getRoleBadge(role: User["role"]): string {
  switch (role) {
    case "admin":
      return "🔴 Admin";
    case "user":
      return "🟢 User";
    case "guest":
      return "⚪ Guest";
  }
}

export function UserCard({ user, onDelete, showEmail = true }: UserCardProps) {
  if (!user) {
    return <div data-testid="user-card-empty">No user data</div>;
  }

  return (
    <div data-testid={`user-card-${user.id}`} className="user-card">
      <h2 data-testid="user-name">{user.name}</h2>
      {showEmail && (
        <p data-testid="user-email">{user.email}</p>
      )}
      <span data-testid="user-role">{getRoleBadge(user.role)}</span>
      {onDelete && (
        <button
          data-testid="delete-button"
          onClick={() => onDelete(user.id)}
          aria-label={`Delete ${user.name}`}
        >
          Delete
        </button>
      )}
    </div>
  );
}
