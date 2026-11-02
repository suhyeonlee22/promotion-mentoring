import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/switch-user");
  }

  if (currentUser.role === "HR") {
    redirect("/hr/rounds");
  }

  if (currentUser.role === "EMPLOYEE") {
    redirect("/me");
  }

  redirect("/switch-user");
}