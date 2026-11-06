import { Button } from "@/components/ui/primitives";
import { PageHeader } from "@/components/ui/workspace";
import { db } from "@/db/client";
import { appUser } from "@/db/schema";
import { notFound } from "next/navigation";
import { switchUserAction } from "./actions";


export default async function SwitchUserPage() {
    if (process.env.NODE_ENV === "production") notFound();
    // 사용자 목록 조회
    const users = await db.select().from(appUser);
    return (
        <main className="workspace-page auth-page auth-page--switch">
            <PageHeader description="개발 환경에서 사용할 계정을 선택하세요.">사용자 전환</PageHeader>
        <ul>
            {users.map((user) => (
                <li key={user.userId}>
                    <span>{user.name}</span>
                    <span>{user.role}</span>
                    <form action={switchUserAction.bind(null, user.userId)}>
                        <Button variant="primary" type="submit">선택</Button>
                    </form>
                </li>
            ))}
        </ul>
        </main>
    );
}
