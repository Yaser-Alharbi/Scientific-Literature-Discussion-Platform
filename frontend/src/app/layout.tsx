// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Navbar from "@/components/ui/Navbar";
import PageLoadDelay from "@/components/ui/PageLoadDelay";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Scientific Literature Discussion Platform",
  description: "A platform for discussing scientific literature",
};



export default function RootLayout({children,}: Readonly<{children: React.ReactNode;}>) {

  return ( 
    // Hydration: React comparing server-rendered HTML with client-side JS to make it interactive
    <html>
      <body className="min-h-screen" suppressHydrationWarning={true}> {/* suppressHydrationWarning: prevents hydration mismatch from browser extensions adding classes */}
        <div className="flex flex-col min-h-screen w-full">
          <Navbar />
          <main className="flex-grow w-full">
            <PageLoadDelay>{children}</PageLoadDelay>
          </main>
        </div>
      </body>
    </html>
  );
}

