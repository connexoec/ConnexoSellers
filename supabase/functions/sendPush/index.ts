// Supabase Edge Function: sendPush — Connexo Sellers
// Envía notificaciones Web Push a todos los dispositivos suscritos de un usuario.
// La dispara un Database Webhook sobre public.notifications (evento INSERT),
// así que da igual si la notificación la creó un trigger o la propia app.
//
// Despliegue (una sola vez):
//   1. supabase link --project-ref aisjtkezgumawgjmwckb
//   2. supabase secrets set VAPID_PUBLIC_KEY=<PUBLICA> VAPID_PRIVATE_KEY=<PRIVADA> \
//        VAPID_SUBJECT=mailto:soporte@connexo.ec
//   3. supabase functions deploy sendPush --no-verify-jwt
//   (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las inyecta la plataforma)
//
// Luego: Supabase → Database → Webhooks → New hook
//   Tabla: public.notifications | Evento: INSERT | Tipo: Edge Function → sendPush

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:soporte@connexo.ec";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      throw new Error("Faltan los secretos VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.");
    }

    const payload = await req.json().catch(() => ({}));
    // El webhook manda { type, table, record, old_record, schema }.
    // También se acepta invocación directa con { user_id, title, body, url }.
    const record = payload.record ?? payload;
    const userId: string | undefined = record.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, reason: "sin user_id" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (error) throw error;

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = JSON.stringify({
      title: record.title ?? "Connexo Ventas",
      body: record.body ?? "",
      url: record.url ?? "/",
      tag: record.type ?? "connexo",
    });

    let sent = 0;
    // Detalle por dispositivo: sin esto, un endpoint rechazado (p. ej. 403 por
    // llave VAPID que no corresponde) es indistinguible de un envío correcto.
    const results: Array<Record<string, unknown>> = [];

    await Promise.all(
      subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
        const host = (() => {
          try { return new URL(s.endpoint).host; } catch { return "?"; }
        })();
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
          sent++;
          results.push({ host, ok: true });
        } catch (err) {
          const e = err as { statusCode?: number; body?: string; message?: string };
          const code = e?.statusCode;
          const detail = String(e?.body ?? e?.message ?? err).slice(0, 300);
          results.push({ host, ok: false, statusCode: code ?? null, detail });
          console.error(`[sendPush] fallo user=${userId} host=${host} status=${code}: ${detail}`);

          // 404/410 = suscripción caducada → se elimina.
          // El 403 NO se borra a propósito: suele ser configuración de llaves
          // VAPID, y borrar la fila haría perder un dispositivo válido.
          if (code === 404 || code === 410) {
            await admin
              .from("push_subscriptions")
              .delete()
              .eq("user_id", userId)
              .eq("endpoint", s.endpoint);
          }
        }
      }),
    );

    const failed = results.length - sent;
    if (failed > 0) {
      console.error(`[sendPush] user=${userId}: ${sent} enviadas, ${failed} fallidas`, JSON.stringify(results));
    }

    return new Response(JSON.stringify({ ok: true, sent, failed, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error)?.message ?? String(e) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
