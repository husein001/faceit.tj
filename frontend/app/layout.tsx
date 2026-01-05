import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/layout/Header';

export const metadata: Metadata = {
  title: 'Faceit.TJ - CS2 Matchmaking',
  description: 'The ultimate ranked matchmaking platform for Counter-Strike 2 in Tajikistan and Uzbekistan',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background-dark text-white font-display antialiased min-h-screen">
        <Header />
        <main className="pt-16">{children}</main>
      </body>
    </html>
  );
}
