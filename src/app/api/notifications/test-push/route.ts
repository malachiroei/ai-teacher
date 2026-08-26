import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { configureWebPush, vapidConfigured } from "@/lib/web-push";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized — יש להתחבר" }, { status: 401 });
  }

  if (!vapidConfigured()) {
    return NextResponse.json(
      { error: "VAPID keys missing on server (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)" },
      { status: 500 },
    );
  }

  // User-scoped read via RLS — no SERVICE_ROLE required for the test button.
  const { data: rows, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .eq("enabled", true)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: `DB read failed: ${error.message}. Run push_subscriptions SQL in Supabase.` },
      { status: 500 },
    );
  }
  if (!rows?.length) {
    return NextResponse.json(
      { error: "No push subscription saved. Tap the bell to enable reminders, then try again." },
      { status: 404 },
    );
  }

  let webPush;
  try {
    webPush = configureWebPush();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "VAPID setup failed" }, { status: 500 });
  }

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
        await supabase.from("push_subscriptions").delete().eq("id", row.id);
      }
    }
  }

  console.log(`[test-push] user=${user.id} sent=${sent} failed=${failed}`);
  if (sent === 0) {
    return NextResponse.json({ ok: false, sent, failed, error: errors[0] || "Push failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sent, failed });
}
