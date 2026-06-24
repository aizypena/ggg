export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[var(--spacing-container-max)] flex-col items-center justify-center gap-8 p-10">
      <span className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-acid-yellow">
        Good Game Guild
      </span>
      <h1 className="font-display text-5xl font-extrabold tracking-tight text-primary">GGG</h1>
      <div className="high-contrast-card acid-glow rounded-none p-8 text-center">
        <p className="font-mono text-sm text-acid-yellow-bright">PRIZE POOL</p>
        <p className="font-display text-6xl font-extrabold text-acid-yellow">0 XLM</p>
      </div>
      <div className="violet-accent glass-panel rounded-xl p-6">
        <p className="text-on-surface-variant">
          Trustless tournament prize-escrow on Stellar Soroban.
        </p>
      </div>
    </main>
  );
}
