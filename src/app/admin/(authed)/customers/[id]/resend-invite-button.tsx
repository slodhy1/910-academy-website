"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { resendAccountInviteAction } from "./actions";

export function ResendInviteButton({
  customerId,
  customerEmail,
}: {
  customerId: string;
  customerEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const res = await resendAccountInviteAction(customerId);
      if (res.success) {
        toast.success(`Account link sent to ${customerEmail}`);
        setOpen(false);
      } else {
        toast.error(`Send failed: ${res.error}`);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
        Resend account link
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send account-creation email?</AlertDialogTitle>
          <AlertDialogDescription>
            Email <strong>{customerEmail}</strong> a link to create their
            account. The link pre-fills this email so their existing products
            link up automatically when they sign up.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={pending}
          >
            {pending ? "Sending..." : "Send email"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
