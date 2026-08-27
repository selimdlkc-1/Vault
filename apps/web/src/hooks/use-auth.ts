"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/context/auth-context";
import { authApi } from "@/lib/api-client";

/**
 * Auth mutation hook'ları (docs/05_FRONTEND_SPEC.md §4). Form bileşenleri bunları
 * kullanır; `AuthContext`'e yazma ve yönlendirme burada merkezîdir.
 */

interface Credentials {
  email: string;
  password: string;
}

export function useLogin() {
  const { applySession } = useAuthContext();
  const router = useRouter();

  return useMutation({
    mutationFn: (input: Credentials) => authApi.login(input),
    onSuccess: (data) => {
      applySession(data.accessToken, data.user);
      router.replace("/dashboard");
    },
  });
}

export function useRegister() {
  const { applySession } = useAuthContext();
  const router = useRouter();

  return useMutation({
    // Kayıt başarılıysa aynı bilgilerle otomatik login (docs/06 §4.1 S-AUTH-REGISTER).
    mutationFn: async (input: Credentials) => {
      await authApi.register(input);
      return authApi.login(input);
    },
    onSuccess: (data) => {
      applySession(data.accessToken, data.user);
      router.replace("/dashboard");
    },
  });
}

export function useLogout() {
  const { clearSession } = useAuthContext();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      try {
        await authApi.logout();
      } catch {
        // Ağ/oturum hatası olsa da yerel oturumu her durumda temizleriz.
      }
    },
    onSuccess: () => {
      clearSession();
      router.replace("/login");
    },
  });
}
