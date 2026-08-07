import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Levorato Prospect",
  description: "Prospecção ativa de leads no Instagram",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
