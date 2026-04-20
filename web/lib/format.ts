/**
 * Short, fan-facing labels for WCA events. `raw_wca` gives us "3x3x3 Cube"
 * which is correct but clunky; in our UI we use ×-symbol and lose redundant
 * "Cube" suffix.
 */
export const EVENT_LABEL: Record<string, string> = {
  '333': '3×3',
  '222': '2×2',
  '444': '4×4',
  '555': '5×5',
  '666': '6×6',
  '777': '7×7',
  '333bf': '3×3 Blind',
  '444bf': '4×4 Blind',
  '555bf': '5×5 Blind',
  '333mbf': 'Multi-Blind',
  '333oh': 'One-Handed',
  '333fm': 'Fewest Moves',
  clock: 'Clock',
  minx: 'Megaminx',
  pyram: 'Pyraminx',
  skewb: 'Skewb',
  sq1: 'Square-1',
  '333ft': '3×3 With Feet',
  magic: 'Magic',
  mmagic: 'Master Magic',
  '333mbo': 'Multi-Blind (old)',
};

export function eventLabel(id: string, fallback?: string): string {
  return EVENT_LABEL[id] ?? fallback ?? id;
}

/**
 * Format a WCA result value for display based on the event's metric format.
 *
 *  - `time`   : centiseconds → mm:ss.cc / ss.cc
 *  - `number` : raw moves (or 100*moves for FMC averages)
 *  - `multi`  : encoded decimal — decode to "solved/attempted in time"
 */
export function formatResult(
  value: number,
  format: 'time' | 'number' | 'multi',
  isAverage: boolean = false,
): string {
  if (value == null || value <= 0) return '—';

  if (format === 'time') {
    const totalCs = value;
    const minutes = Math.floor(totalCs / 6000);
    const seconds = (totalCs - minutes * 6000) / 100;
    if (minutes > 0) {
      return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
    }
    return seconds.toFixed(2);
  }

  if (format === 'number') {
    // FMC averages are stored as 100×mean (so 2345 = 23.45 moves).
    if (isAverage) return (value / 100).toFixed(2);
    return String(value);
  }

  if (format === 'multi') {
    // New encoding only: 0DDTTTTTMM
    const padded = value.toString().padStart(10, '0');
    const DD = parseInt(padded.slice(1, 3), 10);
    const TTTTT = parseInt(padded.slice(3, 8), 10);
    const MM = parseInt(padded.slice(8, 10), 10);
    const diff = 99 - DD;
    const solved = diff + MM;
    const attempted = solved + MM;
    const minutes = Math.floor(TTTTT / 60);
    const secs = TTTTT % 60;
    return `${solved}/${attempted} in ${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  return String(value);
}

/**
 * Round-type id → short human label. Only the important ones; fallback is
 * the raw id.
 */
export function roundLabel(id: string): string {
  switch (id) {
    case 'f':
      return 'Final';
    case 'c':
      return 'Combined Final';
    case '3':
    case 'g':
      return 'Semi-Final';
    case '2':
    case 'e':
      return 'Round 2';
    case '1':
    case 'd':
      return 'Round 1';
    case '0':
    case 'h':
    case 'b':
      return 'First Round';
    default:
      return id;
  }
}

export function formatRating(r: number): string {
  return r.toFixed(2);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
