"use client";
import { useState } from "react";

function truncate(v: string): string {
  return v.length > 14 ? `${v.slice(0, 6)}…${v.slice(-6)}` : v;
}

export function ContractAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      aria-label={`Copy address ${value}`}
      onClick={handleCopy}
      className="data-mono inline-flex items-center gap-2 rounded-lg bg-surface-container px-2 py-1 text-acid-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-electric-violet-strong"
    >
      <span aria-hidden="true">{truncate(value)}</span>
      <span className="material-symbols-outlined text-base" aria-hidden="true">
        {copied ? "check" : "content_copy"}
      </span>
      {copied && <span className="sr-only">Copied!</span>}
    </button>
  );
}
