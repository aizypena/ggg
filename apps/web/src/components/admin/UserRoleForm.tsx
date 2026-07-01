"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";

interface UserRoleFormProps {
  userId: string;
  currentRole: Role;
  disabled?: boolean;
}

export function UserRoleForm({ userId, currentRole, disabled }: UserRoleFormProps) {
  const [role, setRole] = useState<Role>(currentRole);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (role === currentRole) return;

    setStatus("loading");
    setMessage("");

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const json = await res.json();

    if (!res.ok) {
      setStatus("error");
      setMessage(json.error?.message || "Failed to update role");
      return;
    }

    setStatus("done");
    setMessage("Role updated");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="role" className="label-caps text-on-surface-variant">
        Role
      </label>
      <div className="flex items-center gap-3">
        <select
          id="role"
          value={role}
          disabled={disabled || status === "loading"}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-lg border border-surface-variant bg-surface-container px-3 py-2 text-on-surface disabled:opacity-60"
        >
          <option value="ORGANIZER">Organizer</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button
          type="submit"
          disabled={disabled || role === currentRole || status === "loading"}
          className="label-caps rounded-lg bg-primary px-4 py-2 text-on-primary disabled:opacity-60"
        >
          {status === "loading" ? "Saving…" : "Update"}
        </button>
      </div>
      {disabled && <p className="text-sm text-on-surface-variant">You cannot change your own role.</p>}
      {message && (
        <p className={status === "error" ? "text-sm text-error" : "text-sm text-success"}>
          {message}
        </p>
      )}
    </form>
  );
}
