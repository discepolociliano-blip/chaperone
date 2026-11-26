import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chaperone',
  description: 'One query surface over the public molecular biology APIs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
