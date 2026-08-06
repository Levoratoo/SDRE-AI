import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

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
      <body className={`${fraunces.variable} ${manrope.variable}`}>
        <style>{`:root{--font-display:var(--font-fraunces);--font-body:var(--font-manrope)}`}</style>
        {children}
      </body>
    </html>
  );
}
