"use server";
import { notFound, redirect } from "next/navigation";
import { setCurrentUser } from "@/lib/session";
export async function switchUserAction(userId: string) {
  if (process.env.NODE_ENV === "production") notFound();
  await setCurrentUser(userId);
  redirect("/");
}
