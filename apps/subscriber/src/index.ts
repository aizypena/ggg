async function main(): Promise<void> {
  // poll loop wired in Task 8 (P5.8)
}

main().catch((err: unknown) => {
  console.error("[subscriber] fatal", err);
  process.exit(1);
});
