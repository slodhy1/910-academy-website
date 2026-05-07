"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { grantProductAction } from "./actions";

type Product = { id: string; slug: string; title: string };

export function GrantForm({
  customerId,
  availableProducts,
}: {
  customerId: string;
  availableProducts: Product[];
}) {
  const [productId, setProductId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  function onGrant() {
    if (!productId) return;
    const product = availableProducts.find((p) => p.id === productId);
    startTransition(async () => {
      const res = await grantProductAction(customerId, productId);
      if (res.success) {
        toast.success(`Granted ${product?.title || "product"}`);
        setProductId("");
      } else {
        toast.error(`Grant failed: ${res.error}`);
      }
    });
  }

  if (availableProducts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Customer has every active product. Nothing left to grant.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Select value={productId} onValueChange={(v) => setProductId(v ?? "")} disabled={pending}>
        <SelectTrigger className="w-72">
          <SelectValue placeholder="Pick a product..." />
        </SelectTrigger>
        <SelectContent>
          {availableProducts.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={onGrant} disabled={!productId || pending}>
        {pending ? "Granting..." : "Grant access"}
      </Button>
    </div>
  );
}
