
import type { Metadata } from 'next';
import './globals.css';
import { ViewportProvider } from '@/context/viewport-context';
import ClientLayout from '@/components/client-layout';

export const metadata: Metadata = {
  title: 'Bit Sim',
  description: 'A Bitcoin Trading Simulation',
};

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
