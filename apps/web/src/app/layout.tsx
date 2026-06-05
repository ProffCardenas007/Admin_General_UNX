import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import AppBrandLink from "./app-brand-link";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sistema de Proyectos",
  description: "Panel gerencial para seguimiento de equipos y tareas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="app-brand-bar">
          <div className="app-brand-wrap">
            <AppBrandLink />
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <SpeedInsights />
      </body>
    </html>
  );
}
