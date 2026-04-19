export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

export const metadata = {
  title: 'Speedcube Ratings',
  description: 'Dynamic performance ratings for the speedcubing community.',
};
