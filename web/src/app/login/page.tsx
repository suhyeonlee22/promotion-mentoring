import Link from "next/link";
import { loginAction } from "./actions";
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return <main className="mx-auto max-w-md space-y-5 p-6"><h1 className="text-2xl font-bold">로그인</h1>
    {typeof error === "string" && <p role="alert" className="text-red-600">{error}</p>}
    <form action={loginAction} className="space-y-4"><label className="block">아이디 <input name="userId" autoComplete="username" required className="w-full rounded border p-2"/></label><label className="block">비밀번호 <input name="password" type="password" autoComplete="current-password" required className="w-full rounded border p-2"/></label><button className="rounded border px-4 py-2">로그인</button></form>
    {process.env.NODE_ENV !== "production" && <Link href="/switch-user">개발용 사용자 전환</Link>}
  </main>;
}
