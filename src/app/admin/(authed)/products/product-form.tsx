"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createProductAction, updateProductAction, type ActionResult } from "./actions";

type Mode = "create" | "edit";

export type ProductFormValues = {
  slug: string;
  title: string;
  short_description: string;
  long_description: string;
  price_cents: number;
  vimeo_id: string;
  vimeo_hash: string;
  thumbnail_url: string;
  stripe_price_id: string;
  stripe_payment_link: string;
  stripe_payment_link_id: string;
  resource_type: string;
  status: "active" | "archived" | "draft";
};

export const EMPTY_PRODUCT: ProductFormValues = {
  slug: "",
  title: "",
  short_description: "",
  long_description: "",
  price_cents: 0,
  vimeo_id: "",
  vimeo_hash: "",
  thumbnail_url: "",
  stripe_price_id: "",
  stripe_payment_link: "",
  stripe_payment_link_id: "",
  resource_type: "video",
  status: "draft",
};

export function ProductForm({
  mode,
  productId,
  initial,
}: {
  mode: Mode;
  productId?: string;
  initial: ProductFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function setField<K extends keyof ProductFormValues>(key: K, val: ProductFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
    if (errors[key as string]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key as string];
        return next;
      });
    }
  }

  function autoSlugFromTitle() {
    if (mode !== "create" || values.slug) return;
    const slug = values.title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    if (slug) setField("slug", slug);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res: ActionResult =
        mode === "create"
          ? await createProductAction(fd)
          : await updateProductAction(productId!, fd);
      if (!res.success) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error);
        return;
      }
      toast.success(mode === "create" ? "Product created" : "Product updated");
      if (mode === "create") {
        router.push(`/admin/products/${res.slug}/edit`);
      } else if (res.slug !== values.slug) {
        // Slug changed — bounce to the new edit URL
        router.push(`/admin/products/${res.slug}/edit`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Core</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Title" name="title" error={errors.title}>
            <Input
              id="title"
              name="title"
              required
              value={values.title}
              onChange={(e) => setField("title", e.target.value)}
              onBlur={autoSlugFromTitle}
              maxLength={200}
            />
          </Field>
          <Field label="Slug" name="slug" error={errors.slug} hint="URL-safe id, lowercase. Edit with care once live.">
            <Input
              id="slug"
              name="slug"
              required
              value={values.slug}
              onChange={(e) => setField("slug", e.target.value.toLowerCase())}
              maxLength={100}
              pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            />
          </Field>
          <Field label="Price (cents)" name="price_cents" error={errors.price_cents} hint={values.price_cents ? `$${(values.price_cents / 100).toFixed(2)}` : undefined}>
            <Input
              id="price_cents"
              name="price_cents"
              type="number"
              required
              min={0}
              step={1}
              value={values.price_cents}
              onChange={(e) => setField("price_cents", Number.parseInt(e.target.value || "0", 10))}
            />
          </Field>
          <Field label="Status" name="status" error={errors.status}>
            <Select
              value={values.status}
              onValueChange={(v) => setField("status", (v ?? "draft") as ProductFormValues["status"])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">draft</SelectItem>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="archived">archived</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="status" value={values.status} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Short description" name="short_description" error={errors.short_description}>
            <Input
              id="short_description"
              name="short_description"
              value={values.short_description}
              onChange={(e) => setField("short_description", e.target.value)}
              maxLength={500}
            />
          </Field>
          <Field label="Long description" name="long_description" error={errors.long_description}>
            <Textarea
              id="long_description"
              name="long_description"
              rows={5}
              value={values.long_description}
              onChange={(e) => setField("long_description", e.target.value)}
              maxLength={5000}
            />
          </Field>
          <Field label="Thumbnail URL" name="thumbnail_url" error={errors.thumbnail_url}>
            <Input
              id="thumbnail_url"
              name="thumbnail_url"
              value={values.thumbnail_url}
              onChange={(e) => setField("thumbnail_url", e.target.value)}
              maxLength={500}
              placeholder="/og-images/product-slug.jpg"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Media</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Resource type" name="resource_type" error={errors.resource_type}>
            <Select
              value={values.resource_type || ""}
              onValueChange={(v) => setField("resource_type", v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="video">video</SelectItem>
                <SelectItem value="pdf">pdf</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="resource_type" value={values.resource_type} />
          </Field>
          <Field label="Vimeo ID" name="vimeo_id" error={errors.vimeo_id}>
            <Input
              id="vimeo_id"
              name="vimeo_id"
              value={values.vimeo_id}
              onChange={(e) => setField("vimeo_id", e.target.value)}
              maxLength={100}
            />
          </Field>
          <Field label="Vimeo hash" name="vimeo_hash" error={errors.vimeo_hash} hint="For unlisted Vimeo videos.">
            <Input
              id="vimeo_hash"
              name="vimeo_hash"
              value={values.vimeo_hash}
              onChange={(e) => setField("vimeo_hash", e.target.value)}
              maxLength={100}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stripe</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Stripe price id" name="stripe_price_id" error={errors.stripe_price_id}>
            <Input
              id="stripe_price_id"
              name="stripe_price_id"
              value={values.stripe_price_id}
              onChange={(e) => setField("stripe_price_id", e.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label="Stripe payment link URL" name="stripe_payment_link" error={errors.stripe_payment_link}>
            <Input
              id="stripe_payment_link"
              name="stripe_payment_link"
              value={values.stripe_payment_link}
              onChange={(e) => setField("stripe_payment_link", e.target.value)}
              maxLength={500}
            />
          </Field>
          <Field label="Stripe payment link id" name="stripe_payment_link_id" error={errors.stripe_payment_link_id} hint="Used by webhook to map plink to product.">
            <Input
              id="stripe_payment_link_id"
              name="stripe_payment_link_id"
              value={values.stripe_payment_link_id}
              onChange={(e) => setField("stripe_payment_link_id", e.target.value)}
              maxLength={200}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (mode === "create" ? "Creating..." : "Saving...") : mode === "create" ? "Create product" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/products")}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
