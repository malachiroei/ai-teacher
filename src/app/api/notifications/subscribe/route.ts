import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizePreferredTime } from "@/lib/web-push";

export const dynamic = "force-dynamic";

type SubscribeBody = {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  preferredTime?: string;
  timezone?: string;
  enabled?: boolean;
  tutorName?: string;
  kidName?: string;
  goalMinutes?: number;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SubscribeBody = {};
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let admin;
  try {
    admin = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const endpoint = String(body.subscription?.endpoint || "").trim();
  const p256dh = String(body.subscription?.keys?.p256dh || "").trim();
  const auth = String(body.subscription?.keys?.auth || "").trim();
  const enabled = body.enabled !== false;
  const preferredTime = normalizePreferredTime(body.preferredTime || "17:00");
  const timezone = String(body.timezone || "Asia/Jerusalem").trim() || "Asia/Jerusalem";
  const nowIso = new Date().toISOString();

  if (!enabled) {
    const query = admin
      .from("push_subscriptions")
      .update({ enabled: false, updated_at: nowIso })
      .eq("user_id", user.id);
    const { error } = endpoint ? await query.eq("endpoint", endpoint) : await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, enabled: false });
  }

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Missing push subscription" }, { status: 400 });
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      preferred_time: preferredTime,
      timezone,
      enabled: true,
      tutor_name: body.tutorName?.trim() || null,
      kid_name: body.kidName?.trim() || null,
      goal_minutes: Number.isFinite(Number(body.goalMinutes)) ? Number(body.goalMinutes) : 10,
      updated_at: nowIso,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, enabled: true });
}
