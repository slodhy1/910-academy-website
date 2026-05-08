"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteProductAction } from "../../actions";

export function DeleteProductButton({
  productId,
  title,
  slug,
  grantCount,
}: {
  productId: string;
  title: string;
  slug: string;
  grantCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();
  const requiresTypedConfirm = grantCount > 0;
  const canSubmit =
    !pending && (!requiresTypedConfirm || confirmText.trim().toUpperCase() === "DELETE");

  function onConfirm() {
    startTransition(async () => {
      const res = await deleteProductAction(productId);
      // deleteProductAction redirects on success, so we typically don't reach here
      // unless it errored out before the redirect.
      if (res && !res.success) {
        toast.error(`Delete failed: ${res.error}`);
      } else {
        toast.success(`Deleted ${title}`);
        setOpen(false);
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setConfirmText("");
      }}
    >
      <AlertDialogTrigger
        render={
          <Button variant="outline" className="text-destructive hover:text-destructive" />
        }
      >
        <Trash2 className="h-4 w-4" />
        Delete product
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{title}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            {requiresTypedConfirm
              ? `This product has ${grantCount} customer grant${grantCount === 1 ? "" : "s"}. Deleting it will cascade-delete all grant rows. Customers will lose access immediately. Their Stripe payment records stay intact.`
              : `This product has no grants. Deleting it removes the row from the catalog. The slug "${slug}" becomes available for reuse.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requiresTypedConfirm && (
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              placeholder="DELETE"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              if (!canSubmit) return;
              onConfirm();
            }}
            disabled={!canSubmit}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
