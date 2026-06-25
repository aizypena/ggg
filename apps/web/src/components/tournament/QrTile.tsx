"use client";
import { QRCodeSVG } from "qrcode.react";

interface QrTileProps {
  /** The SEP-7 URI (or any string value) to encode as a QR code. */
  value: string;
  /** Size in pixels of the QR code itself (not including white quiet-zone padding). @defaultValue 180 */
  size?: number;
}

/**
 * QrTile — renders a SEP-7 URI as a QR code inside a white-padded tile.
 *
 * QR codes require a light "quiet zone" to be scannable on dark backgrounds.
 * The outer tile uses the brand surface; the inner white box provides the
 * mandatory quiet zone.
 */
export function QrTile({ value, size = 180 }: QrTileProps) {
  return (
    <div className="violet-accent inline-block rounded-xl bg-surface-container p-4">
      <div
        className="rounded-lg bg-white p-4"
        role="img"
        aria-label="SEP-7 join QR — scan with a Stellar wallet app to join"
      >
        <QRCodeSVG value={value} size={size} level="M" />
      </div>
    </div>
  );
}
