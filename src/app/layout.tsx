import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const font = Outfit({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "TalkFuze Dashboard",
  description: "Omnichannel AI Chat Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${font.variable} font-sans antialiased bg-[#F8FAFC] text-[#111827] selection:bg-blue-100 selection:text-blue-900`}>
        {children}
      </body>
    </html>
  );
}
