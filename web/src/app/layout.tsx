import type { Metadata } from "next";
import { Noto_Sans_KR, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getCurrentUser } from "@/lib/session";
import { unreadNotificationCount } from "@/services/notifications";
import { AppShell } from "@/components/layout/app-shell";
export const dynamic = "force-dynamic";


const notoSans = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "승진승급 관리",
  description: "직원 승진승급 관리시스템 (멘토링 실습)",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const currentUser = await getCurrentUser();
  const unread = await unreadNotificationCount(currentUser);
  return (
    <html
      lang="ko"
      className={`${notoSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppShell user={currentUser} unread={unread} development={process.env.NODE_ENV !== "production"}>{children}</AppShell>
      </body>
    </html>
  );
}
