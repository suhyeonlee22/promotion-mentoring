import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
export const dynamic = "force-dynamic";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="print:hidden flex items-center justify-between border-b px-6 py-4">
          {currentUser && (
            <span>
              {currentUser.name} ({currentUser.role})
            </span>
          )}

          <Link href="/switch-user">사용자 전환</Link>


          {currentUser?.role === "HR" && (
            <>
              <Link href="/hr/rounds">승진 회차 관리</Link>
              <Link href="/hr/mails">메일 발송함</Link>
              <Link href="/hr/step-mail">승급 안내 메일</Link>
            </>
          )}
          {currentUser?.role === "EMPLOYEE" && (
            <>
              <Link href="/me/promotion">내 승진 신청서</Link>
              <Link href="/me">내 정보</Link>
              <Link href="/me/mails">내 메일함</Link>
            </>
          )}
        </header>
        {/* 각 페이지의 실제 내용 */}
        {children}
        </body>
    </html>
  );
}
