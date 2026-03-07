import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { z } from 'zod';

export const prerender = false;

const rsvpSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  persons: z.number().int().min(1).max(20),
  website: z.string().optional(),
});

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(ip, recent);
    return true;
  }

  recent.push(now);
  rateLimitMap.set(ip, recent);
  return false;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml(name: string, persons: number, date: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New RSVP</title>
</head>
<body style="margin:0;padding:0;background-color:#fdf8f2;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fdf8f2;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 12px rgba(180,150,90,0.12);">

          <!-- Header -->
          <tr>
            <td style="background-color:#c9a84c;padding:36px 48px;text-align:center;">
              <p style="margin:0;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#fdf8f2;font-family:'Georgia',serif;">Wedding Invitation</p>
              <h1 style="margin:12px 0 0;font-size:30px;font-weight:400;color:#ffffff;font-family:'Georgia',serif;letter-spacing:1px;">New RSVP Received</h1>
            </td>
          </tr>

          <!-- Divider ornament -->
          <tr>
            <td style="background-color:#f5ece0;padding:10px 48px;text-align:center;">
              <p style="margin:0;color:#c9a84c;font-size:20px;letter-spacing:8px;">&#10022; &#10022; &#10022;</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 48px;">
              <p style="margin:0 0 28px;font-size:16px;color:#6b5a3e;line-height:1.7;">
                A new guest has confirmed their attendance. Details are listed below.
              </p>

              <!-- Detail rows -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:14px 20px;background-color:#fdf8f2;border-left:3px solid #c9a84c;border-radius:2px;margin-bottom:12px;">
                    <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a08050;font-family:'Georgia',serif;">Guest Name</p>
                    <p style="margin:6px 0 0;font-size:20px;color:#3d2e1a;font-family:'Georgia',serif;font-weight:400;">${name}</p>
                  </td>
                </tr>
                <tr><td style="height:12px;"></td></tr>
                <tr>
                  <td style="padding:14px 20px;background-color:#fdf8f2;border-left:3px solid #c9a84c;border-radius:2px;">
                    <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a08050;font-family:'Georgia',serif;">Number of Persons</p>
                    <p style="margin:6px 0 0;font-size:20px;color:#3d2e1a;font-family:'Georgia',serif;font-weight:400;">${persons} ${persons === 1 ? 'person' : 'persons'}</p>
                  </td>
                </tr>
                <tr><td style="height:12px;"></td></tr>
                <tr>
                  <td style="padding:14px 20px;background-color:#fdf8f2;border-left:3px solid #c9a84c;border-radius:2px;">
                    <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a08050;font-family:'Georgia',serif;">Submitted On</p>
                    <p style="margin:6px 0 0;font-size:16px;color:#3d2e1a;font-family:'Georgia',serif;">${date}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f5ece0;padding:24px 48px;text-align:center;border-top:1px solid #e8d9c0;">
              <p style="margin:0;font-size:12px;color:#a08050;letter-spacing:1px;">This is an automated notification from your wedding website.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = rsvpSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (parsed.data.website) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { name, persons } = parsed.data;
  const submittedAt = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const resend = new Resend(import.meta.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: 'RSVP <confirmation@pam-alex.com>',
    to: import.meta.env.RECIPIENT_EMAIL,
    subject: `New RSVP from ${name}`,
    html: buildEmailHtml(escapeHtml(name), persons, submittedAt),
  });

  if (error) {
    console.error('Resend error:', error);
    return new Response(JSON.stringify({ error: 'Failed to send email' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const ALL: APIRoute = () =>
  new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST' },
  });
