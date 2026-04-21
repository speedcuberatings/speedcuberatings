import { redirect } from 'next/navigation';

/**
 * `/calibrate` lands on `/calibrate/333` — 3×3 average is the reference
 * leaderboard James Macdiarmid calibrated the model against, so it's the
 * natural default view for someone showing up to tune knobs.
 */
export default function CalibrateIndex() {
  redirect('/calibrate/333');
}
