"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useLogout } from "@/hooks/use-auth";
import { messages } from "@/lib/messages";

interface LogoutConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
}

/** S-LOGOUT-CONFIRM (docs/06_SCREEN_CATALOG.md §5.1). */
export function LogoutConfirmDialog({ open, onCancel }: LogoutConfirmDialogProps) {
  const logout = useLogout();

  return (
    <Modal
      open={open}
      onDismiss={logout.isPending ? undefined : onCancel}
      title={messages.session.logoutTitle}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={logout.isPending}
          >
            {messages.session.logoutCancel}
          </Button>
          <Button
            variant="danger"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            {messages.session.logoutConfirm}
          </Button>
        </>
      }
    >
      Oturumunuz bu cihazda sonlandırılacak.
    </Modal>
  );
}
