import { db } from "@/db/client";
import { appUser } from "@/db/schema";
import { setCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";


export default async function SwitchUserPage() {
    // 사용자 목록 조회
    const users = await db.select().from(appUser);
    return (
        <main>
            <h1>사용자 전환</h1>
        <ul>
            {users.map((user) => (
                <li key={user.userId}>
                    <span>{user.name}</span>
                    <span>{user.role}</span>
                    <form action={switchAction.bind(null, user.userId)}>
                        <button type="submit">선택</button>
                    </form>
                </li>
            ))}
        </ul>
        </main>
    );
}

async function switchAction(userId: string) {
    "use server";

    // 사용자 전환 함수 호출
    await setCurrentUser(userId);
    //페이지 이동
    redirect("/");
    // 이후 redirect 처리
}
