import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  clockInTimeZone,
  configureWebPush,
  normalizePreferredTime,
  vapidConfigured,
  type PushPayload,
} from "@/lib/web-push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const url = new URL(request.url);
  const query = url.searchParams.get("secret") || url.searchParams.get("key") || "";
  return bearer === secret || query === secret;
}

function payloadFor(row: {
  tutor_name: string | null;
  kid_name: string | null;
  goal_minutes: number | null;
}): PushPayload {
  const tutor = (row.tutor_name || "Alex").trim() || "Alex";
  const name = (row.kid_name || "champ").trim() || "champ";
  const minutes = Math.max(5, Number(row.goal_minutes) || 10);
  return {
    title: `🚀 ${tutor} is waiting for you!`,
    body: `Hey ${name}! Ready for today's quick ${minutes}-min challenge?`,
    url: "/",
    icon: "/icon-192.png",
  };
}

async function sendDueReminders() {
  if (!vapidConfigured()) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, checked: 0, error: "VAPID keys are not configured" };
  }
  const webPush = configureWebPush();
  const supabase = createServiceClient();
  const { data: rows, error } = await supabase.from("push_subscriptions").select("*").eq("enabled", true);
  if (error) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, checked: 0, error: error.message };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const now = new Date();
  const checked = rows?.length ?? 0;

  for (const row of rows || []) {
    const preferred = normalizePreferredTime(row.preferred_time);
    const clock = clockInTimeZone(row.timezone || "Asia/Jerusalem", now);
    if (clock.hhmm !== preferred) {
      skipped += 1;
      continue;
    }
    if (row.last_sent_date === clock.dateKey) {
      skipped += 1;
      continue;
    }

    const payload = payloadFor(row);
    try {
      await webPush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        JSON.stringify(payload),
      );
      await supabase
        .from("push_subscriptions")
        .update({ last_sent_date: clock.dateKey, updated_at: now.toISOString() })
        .eq("id", row.id);
      sent += 1;
    } catch (err) {
      failed += 1;
      const status = Number((err as { statusCode?: number }).statusCode);
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", row.id);
      }
      console.warn("[send-reminders] push failed", row.id, err instanceof Error ? err.message : err);
    }
  }

  const summary = `Sent ${sent} push, ${failed} failed, ${skipped} skipped (${checked} checked)`;
  console.log(`[send-reminders] ${summary}`);
  return { ok: failed === 0, sent, failed, skipped, checked, message: summary };
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sendDueReminders();
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}

export async function POST(request: Request) {
  return GET(request);
}
