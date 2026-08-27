import { redirect } from "next/navigation";

/**
 * Kök `/` — kimlik durumuna göre yönlendirir. `middleware.ts` oturum ipucu
 * cookie'sine göre `/dashboard`'ı `/login`'e (veya tersi) çevirir.
 */
export default function IndexPage() {
  redirect("/dashboard");
}
