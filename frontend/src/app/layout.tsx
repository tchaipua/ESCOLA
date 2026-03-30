import type { Metadata } from "next";
import "./globals.css";
import PwaBootstrap from "@/app/components/pwa-bootstrap";

export const metadata: Metadata = {
  title: "MSINFOR | Gestao Escolar",
  description: "PWA e portal do sistema de gestao escolar.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MSINFOR PWA",
  },
};

export const viewport = {
  themeColor: "#1d4ed8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <PwaBootstrap />
        {children}
      </body>
    </html>
  );
}
