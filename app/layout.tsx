import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Bukay",
  description: "Bukay product app"
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
