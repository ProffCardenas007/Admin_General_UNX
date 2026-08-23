import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import AppNav from "./app-nav";
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
      {/*
        flex (sin flex-col) → sidebar izquierdo + contenido a la derecha.
        La pantalla de login no muestra sidebar (AppNav lo detecta por pathname).
      */}
      <body className="min-h-full flex">
        <AppNav />
        <div className="app-layout-content">
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
