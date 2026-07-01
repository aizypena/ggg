"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DeleteUserButtonProps {
  userId: string;
  username: string;
  disabled?: boolean;
}

export function DeleteUserButton({ userId, username, disabled }: DeleteUserButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function handleDelete() {
    if (!confirm(`Delete user ${username}? This cannot be undone.`)) return;

    setStatus("loading");
    setMessage("");

    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    const json = await res.json();

    if (!res.ok) {
      setStatus("error");
      setMessage(json.error?.message || "Failed to delete user");
      return;
    }

    router.push("/admin/users");
  }

  if (disabled) {
    return <p className="text-sm text-on-surface-variant">You cannot delete your own account.</p>;
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleDelete}
        disabled={status === "loading"}
        className="label-caps rounded-lg bg-error px-4 py-2 text-on-error transition hover:bg-error/90 disabled:opacity-60"
      >
        {status === "loading" ? "Deleting…" : "Delete User"}
      </button>
      {message && <p className="text-sm text-error">{message}</p>}
    </div>
  );
}
