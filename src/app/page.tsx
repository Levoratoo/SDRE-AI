import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch {
    redirect("/login");
  }
  redirect(session ? "/dashboard" : "/login");
}
