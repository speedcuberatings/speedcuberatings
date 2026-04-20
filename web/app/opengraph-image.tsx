import { OG_SIZE, loadOgFonts } from '@/lib/og-fonts';
import { renderHomeOg } from '@/lib/og-render';

export const runtime = 'nodejs';
export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Speedcube Ratings';

export default async function OgImage() {
  const fonts = await loadOgFonts();
  return renderHomeOg(fonts);
}
