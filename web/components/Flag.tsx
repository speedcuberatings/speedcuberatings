/**
 * Render a country as a Unicode regional-indicator flag emoji. Falls back to
 * a dash if we don't have an ISO-2 code. Accessible: we pass the country
 * name as aria-label.
 *
 * Rendering note: macOS/iOS/most Linuxes render color flags; Windows doesn't
 * out of the box. We'll revisit with SVG assets later if needed.
 */
export function Flag({
  iso2,
  name,
  size = 18,
}: {
  iso2: string | null;
  name: string;
  size?: number;
}) {
  const emoji = iso2 ? iso2ToEmoji(iso2) : null;
  return (
    <span
      aria-label={name}
      title={name}
      className="inline-flex items-center justify-center align-middle select-none"
      style={{
        fontSize: size,
        lineHeight: 1,
        width: size * 1.35,
        height: size * 0.95,
        letterSpacing: 0,
      }}
    >
      {emoji ?? <span className="text-[var(--color-muted)]">–</span>}
    </span>
  );
}

function iso2ToEmoji(iso2: string): string {
  const up = iso2.toUpperCase();
  if (up.length !== 2) return '';
  const codePoints = [...up].map((c) => 0x1f1e6 + c.charCodeAt(0) - 'A'.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
