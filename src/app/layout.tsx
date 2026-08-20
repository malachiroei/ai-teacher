import { Plus_Jakarta_Sans } from "next/font/google";
import Script from "next/script";
import type { Metadata, Viewport } from "next";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "BuddyAI",
  title: {
    default: "BuddyAI – Your AI English Best Friend",
    template: "%s",
  },
  description: "Talk, play, and master English naturally with your futuristic AI companion.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "BuddyAI",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#0a0a0c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <body className={`${jakarta.className} antialiased`} suppressHydrationWarning>
        <Script id="tutor-boot" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("selected_tutor");if(t){var m={luna:"emma",mia:"emma",zoey:"emma",leo:"alex",max:"alex",nova:"alex"};var id=m[t]||t;if(id!=="emma"&&id!=="alex")id="emma";document.documentElement.dataset.tutor=id;}}catch(e){}`}
        </Script>
        {children}
        <audio id="ai-voice-player" playsInline preload="auto" hidden />
      </body>
    </html>
  );
}
