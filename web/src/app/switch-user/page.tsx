import { db } from "@/db/client";
import { appUser } from "@/db/schema";
import { notFound } from "next/navigation";
import { switchUserAction } from "./actions";


export default async function SwitchUserPage() {
    if (process.env.NODE_ENV === "production") notFound();
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
                    <form action={switchUserAction.bind(null, user.userId)}>
                        <button type="submit">선택</button>
                    </form>
                </li>
            ))}
        </ul>
        </main>
    );
}
