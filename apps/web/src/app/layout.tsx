import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GGG — Good Game Guild",
  description: "Trustless tournament prize-escrow protocol on Stellar Soroban.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-on-surface antialiased">{children}</body>
    </html>
  );
}
