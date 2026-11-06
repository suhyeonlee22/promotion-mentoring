"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { login } from "@/services/auth";
import { BusinessError } from "@/lib/error";
export async function loginAction(data: FormData) {
  let error = "";
  try { await login(String(data.get("userId") ?? ""), String(data.get("password") ?? "")); }
  catch (e) { if (!(e instanceof BusinessError)) throw e; error = e.message; }
  if (error) redirect(`/login?error=${encodeURIComponent(error)}`);
  revalidatePath("/", "layout");
  redirect("/");
}
export async function logoutAction() {
  (await cookies()).delete("uid");
  revalidatePath("/", "layout");
  redirect("/login");
}
