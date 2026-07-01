"use client";

import { useState } from "react";

interface ResetPasswordButtonProps {
  userId: string;
}

export function ResetPasswordButton({ userId }: ResetPasswordButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [tempPassword, setTempPassword] = useState("");
  const [message, setMessage] = useState("");

  async function handleReset() {
    if (!confirm("Generate a new temporary password?")) return;

    setStatus("loading");
    setTempPassword("");
    setMessage("");

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resetPassword: true }),
    });
    const json = await res.json();

    if (!res.ok) {
      setStatus("error");
      setMessage(json.error?.message || "Failed to reset password");
      return;
    }

    setStatus("done");
    setTempPassword(json.data.tempPassword || "");
    setMessage("Temporary password generated. Copy it now — it will not be shown again.");
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleReset}
        disabled={status === "loading"}
        className="label-caps rounded-lg border border-primary px-4 py-2 text-primary transition hover:bg-primary hover:text-on-primary disabled:opacity-60"
      >
        {status === "loading" ? "Resetting…" : "Reset Password"}
      </button>
      {tempPassword && (
        <div className="rounded-lg bg-surface-container-low p-3">
          <p className="label-caps text-on-surface-variant">Temporary password</p>
          <p className="data-mono mt-1 break-all text-on-surface">{tempPassword}</p>
        </div>
      )}
      {message && (
        <p className={status === "error" ? "text-sm text-error" : "text-sm text-success"}>
          {message}
        </p>
      )}
    </div>
  );
}
