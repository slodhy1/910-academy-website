/**
 * Phase B smoke test for the Stripe webhook handler.
 *
 * Iterates 7 active products, builds a synthetic checkout.session.completed
 * event for each, calls processCheckoutCompleted directly (bypassing HTTP +
 * signature verification), and asserts customers + customer_products + auth
 * user + Resend send all succeeded.
 *
 * Run with:  npx tsx scripts/smoke-test-webhook.ts
 * Requires:  .env.local has SUPABASE_*, STRIPE_*, RESEND_API_KEY, EMAIL_FROM
 *            (load via:  node --env-file=.env.local --import tsx scripts/smoke-test-webhook.ts
 *             or via dotenv if installed).
 */
import type Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { processCheckoutCompleted } from "../src/lib/webhook/process-checkout";

const SLUGS = [
  "lucid-horizon-workshop",
  "known-productions-workshop",
  "jt-visuals-workshop",
  "instagram-masterclass",
  "3d-made-easy",
  "910-sales-system",
  "910-admin-assistant",
];

type Row = {
  slug: string;
  pass: boolean;
  notes: string[];
};

function buildEvent(
  slug: string,
  plinkId: string,
  amountTotal: number,
  email: string
): Stripe.Event {
  const sessionId = `cs_test_smoke_${slug}_${Date.now()}`;
  return {
    id: `evt_smoke_${slug}_${Date.now()}`,
    object: "event",
    api_version: "2024-09-30.acacia",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        amount_total: amountTotal,
        currency: "usd",
        customer: null,
        customer_details: { email, name: "Webhook Smoke Test" },
        customer_email: email,
        payment_link: plinkId,
        metadata: {},
      } as unknown as Stripe.Checkout.Session,
    },
    livemode: true,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed",
  } as unknown as Stripe.Event;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env"
    );
    process.exit(1);
  }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.warn(
      "Note: RESEND_API_KEY or EMAIL_FROM not set — welcome emails will fail (logged, not fatal)"
    );
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const rows: Row[] = [];

  for (const slug of SLUGS) {
    const notes: string[] = [];
    let pass = true;

    const { data: product, error: prodErr } = await sb
      .from("products")
      .select("id, slug, title, price_cents, stripe_payment_link_id")
      .eq("slug", slug)
      .maybeSingle();
    if (prodErr || !product?.stripe_payment_link_id) {
      rows.push({
        slug,
        pass: false,
        notes: [`product lookup failed: ${prodErr?.message ?? "missing plink"}`],
      });
      continue;
    }

    const email = `slodhy1+webhook-test-${slug}@gmail.com`;
    const event = buildEvent(
      slug,
      product.stripe_payment_link_id,
      product.price_cents,
      email
    );

    let processResult;
    try {
      processResult = await processCheckoutCompleted(event);
    } catch (e) {
      rows.push({
        slug,
        pass: false,
        notes: [`processCheckoutCompleted threw: ${(e as Error).message}`],
      });
      continue;
    }

    if (!processResult.success) {
      pass = false;
      notes.push(`process error: ${processResult.error}`);
    }

    const { data: customer } = await sb
      .from("customers")
      .select("id, auth_user_id")
      .eq("email", email)
      .maybeSingle();
    if (!customer) {
      pass = false;
      notes.push("no customers row");
    }

    if (customer) {
      const { data: cp } = await sb
        .from("customer_products")
        .select("id, amount_paid_cents")
        .eq("customer_id", customer.id)
        .eq("product_id", product.id)
        .maybeSingle();
      if (!cp) {
        pass = false;
        notes.push("no customer_products row");
      } else if (cp.amount_paid_cents !== product.price_cents) {
        pass = false;
        notes.push(
          `amount mismatch: got ${cp.amount_paid_cents}, expected ${product.price_cents}`
        );
      }
    }

    const { data: list } = await sb.auth.admin.listUsers({ perPage: 200 });
    const authUser = list?.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (!authUser) {
      pass = false;
      notes.push("auth user not found");
    }

    if (processResult.wasNewUser === false) {
      notes.push("(wasNewUser=false — no email sent)");
    }

    rows.push({ slug, pass, notes });
  }

  console.log("\nCleaning up DB rows…");
  const { data: testCustomers } = await sb
    .from("customers")
    .select("id")
    .like("email", "slodhy1+webhook-test-%@gmail.com");
  const testIds = testCustomers?.map((c) => c.id) ?? [];
  if (testIds.length > 0) {
    const { error: cpDelErr } = await sb
      .from("customer_products")
      .delete()
      .in("customer_id", testIds);
    if (cpDelErr) console.error("cp cleanup error:", cpDelErr);
  }
  const { error: cDelErr } = await sb
    .from("customers")
    .delete()
    .like("email", "slodhy1+webhook-test-%@gmail.com");
  if (cDelErr) console.error("customer cleanup error:", cDelErr);

  console.log("\n=== Smoke test results ===");
  let allPass = true;
  for (const r of rows) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(
      `${status}  ${r.slug.padEnd(30)} ${
        r.notes.length ? "— " + r.notes.join("; ") : ""
      }`
    );
    if (!r.pass) allPass = false;
  }
  console.log(
    "\nhttps://supabase.com/dashboard/project/qkmkxthpeapuecobahhx/auth/users"
  );
  console.log(
    "Manually delete 7 webhook-test-* auth users — SQL DELETE doesn't work on auth schema."
  );

  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
