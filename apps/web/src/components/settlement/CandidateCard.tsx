"use client";

interface CandidateCardProps {
  addr: string;
  used: boolean;
  onAssign: (rank: 1 | 2 | 3) => void;
}

export function CandidateCard({ addr, used, onAssign }: CandidateCardProps) {
  return (
    <div
      draggable={!used}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", addr);
        e.dataTransfer.effectAllowed = "move";
      }}
      data-addr={addr}
      aria-label={`Participant ${addr.slice(0, 6)}…${addr.slice(-6)}`}
      className={[
        "brutalist-border flex flex-col gap-2 rounded-none bg-surface-container p-3",
        used ? "opacity-30 grayscale" : "cursor-grab active:translate-x-0.5 active:translate-y-0.5",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">
          account_circle
        </span>
        <span className="data-mono text-on-surface">
          {addr.slice(0, 6)}…{addr.slice(-6)}
        </span>
      </div>

      {/* Keyboard-accessible assign buttons (a11y alternative to drag-and-drop) */}
      {!used && (
        <div
          className="flex gap-1"
          role="group"
          aria-label={`Assign ${addr.slice(0, 6)}…${addr.slice(-6)} to rank`}
        >
          <button
            type="button"
            onClick={() => onAssign(1)}
            className="label-caps rounded-none border border-outline px-2 py-1 text-xs text-on-surface-variant hover:border-acid-yellow hover:text-acid-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
            aria-label={`Assign 1st to ${addr.slice(0, 6)}…${addr.slice(-6)}`}
          >
            Assign 1st
          </button>
          <button
            type="button"
            onClick={() => onAssign(2)}
            className="label-caps rounded-none border border-outline px-2 py-1 text-xs text-on-surface-variant hover:border-acid-yellow hover:text-acid-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
            aria-label={`Assign 2nd to ${addr.slice(0, 6)}…${addr.slice(-6)}`}
          >
            Assign 2nd
          </button>
          <button
            type="button"
            onClick={() => onAssign(3)}
            className="label-caps rounded-none border border-outline px-2 py-1 text-xs text-on-surface-variant hover:border-acid-yellow hover:text-acid-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
            aria-label={`Assign 3rd to ${addr.slice(0, 6)}…${addr.slice(-6)}`}
          >
            Assign 3rd
          </button>
        </div>
      )}
    </div>
  );
}
