"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAuthContext } from "@/context/auth-context";
import { messages } from "@/lib/messages";

/**
 * S-SESSION-EXPIRED (docs/06_SCREEN_CATALOG.md §5.1). Refresh akışı 401 döndüğünde
 * (`AUTH_TOKEN_EXPIRED` / `AUTH_REFRESH_REUSE_DETECTED`) `AuthContext` bunu
 * tetikler. Kök layout'ta global render edilir.
 */
export function SessionExpiredDialog() {
  const { sessionExpired, acknowledgeExpiry } = useAuthContext();
  const router = useRouter();

  const handleConfirm = () => {
    acknowledgeExpiry();
    router.replace("/login");
  };

  return (
    <Modal
      open={sessionExpired}
      title={messages.session.expiredTitle}
      footer={
        <Button onClick={handleConfirm}>{messages.session.expiredConfirm}</Button>
      }
    >
      {messages.session.expiredBody}
    </Modal>
  );
}
