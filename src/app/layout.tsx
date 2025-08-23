
import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { ViewportProvider, useViewport } from '@/context/viewport-context';

export const metadata: Metadata = {
  title: 'Bit Sim',
  description: 'A Bitcoin Trading Simulation',
};

function ClientLayout({ children }: { children: React.ReactNode }) {
  "use client";
  const { isDesktopView } = useViewport();

  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap" rel="stylesheet" />
        <meta
          name="viewport"
          content={
            isDesktopView
              ? "width=1280, initial-scale=1"
              : "width=device-width, initial-scale=1"
          }
        />
      </head>
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ViewportProvider>
      <ClientLayout>{children}</ClientLayout>
    </ViewportProvider>
  );
}
