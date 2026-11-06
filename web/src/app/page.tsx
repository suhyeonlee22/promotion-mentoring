import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  if (currentUser.role === "HR") {
    redirect("/hr");
  }

  if (currentUser.role === "EMPLOYEE") {
    redirect("/me");
  }

  redirect("/login");
}
