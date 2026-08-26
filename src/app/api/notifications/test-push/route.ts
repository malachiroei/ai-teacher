import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { configureWebPush, vapidConfigured } from "@/lib/web-push";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!vapidConfigured()) {
    return NextResponse.json({ error: "VAPID keys are not configured" }, { status: 500 });
  }

  let admin;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const { data: rows, error } = await admin
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .eq("enabled", true)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!rows?.length) {
    return NextResponse.json({ error: "No push subscription saved yet. Enable reminders first." }, { status: 404 });
  }

  const webPush = configureWebPush();
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const tutor = (row.tutor_name || "Alex").trim() || "Alex";
    const name = (row.kid_name || "champ").trim() || "champ";
    try {
      await webPush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        JSON.stringify({
          title: `🚀 ${tutor} is waiting for you!`,
          body: `Hey ${name}! This is a test push — BuddyAI can reach your phone.`,
          url: "/",
          icon: "/icon-192.png",
        }),
      );
      sent += 1;
    } catch (err) {
      failed += 1;
      const status = Number((err as { statusCode?: number }).statusCode);
      const message = err instanceof Error ? err.message : "send failed";
      errors.push(message);
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", row.id);
      }
    }
  }

  console.log(`[test-push] user=${user.id} sent=${sent} failed=${failed}`);
  if (sent === 0) {
    return NextResponse.json({ ok: false, sent, failed, error: errors[0] || "Push failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sent, failed });
}
