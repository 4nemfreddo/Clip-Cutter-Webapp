import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clip Cutter',
  description: 'Cut social-ready clips from long videos, locally, with FFmpeg.',
};

export const viewport: Viewport = { themeColor: '#0a0c10' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
