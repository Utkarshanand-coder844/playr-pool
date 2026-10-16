/**
 * email.js — Shared Resend email utility for Playr-Pool
 *
 * Uses the Resend HTTP API directly (no extra npm package).
 * Configure RESEND_API_KEY and PASSWORD_RESET_EMAIL_FROM in the deployment
 * environment. In dev/test a missing or placeholder key is silently skipped.
 */

import './env.js';

const RESEND_URL = 'https://api.resend.com/emails';

const isDummy = (key) => !key || key.startsWith('re_xxxxxxxxx') || key === 'your_resend_api_key';

/**
 * sendEmail({ to, subject, html, text })
 * Generic transactional email via Resend. Non-fatal in dev.
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_EMAIL_FROM || 'Playr-Pool <no-reply@playrpool.app>';

  if (isDummy(apiKey)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[DEV] Email not sent (no real RESEND_API_KEY). Would send to: ${to} | Subject: ${subject}`
      );
    }
    return;
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[Email] Resend rejected message to ${to} (status ${res.status}): ${body}`);
    }
  } catch (err) {
    console.warn(`[Email] Failed to send to ${to}:`, err.message);
  }
};

/**
 * sendTournamentInviteEmail
 * Styled HTML + plain-text invite sent to the team captain's registered email.
 */
export const sendTournamentInviteEmail = async ({
  captainEmail,
  captainName,
  teamName,
  sport,
  tournamentName,
  campus,
  frontendUrl,
}) => {
  const tournamentsUrl = `${frontendUrl || process.env.FRONTEND_URL || 'http://localhost:3000'}/tournaments`;

  const text = [
    `Hi ${captainName || 'Captain'},`,
    '',
    `Your team "${teamName}" (${sport}) has been invited to compete in "${tournamentName}" (${campus}).`,
    '',
    'As team captain, you need to accept or decline this invitation.',
    `Open the Tournaments section to respond: ${tournamentsUrl}`,
    '',
    'If you were not expecting this invitation, you can safely ignore this email.',
    '',
    '— The Playr-Pool Team',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" /><title>Tournament Invitation</title></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;color:#e2e8f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
<tr><td align="center">
<table width="100%" style="max-width:560px;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
<tr><td style="background:linear-gradient(135deg,#6366f1,#38bdf8);padding:32px 32px 28px;text-align:center;">
  <div style="font-size:2.5rem;margin-bottom:8px;">&#127942;</div>
  <h1 style="margin:0;font-size:1.4rem;font-weight:800;color:#fff;letter-spacing:-0.5px;">Tournament Invitation</h1>
  <p style="margin:8px 0 0;color:rgba(255,255,255,0.82);font-size:0.9rem;">Your team has been invited to compete</p>
</td></tr>
<tr><td style="padding:28px 32px;">
  <p style="margin:0 0 20px;font-size:1rem;color:#cbd5e1;">Hi <strong style="color:#f1f5f9;">${captainName || 'Captain'}</strong>,</p>
  <div style="background:#0f172a;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid #334155;">
    <span style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Your Team</span>
    <div style="font-size:1.05rem;font-weight:700;color:#f1f5f9;margin-top:2px;">${teamName}</div>
    <div style="font-size:0.8rem;color:#94a3b8;margin-top:2px;">Sport: ${sport}</div>
    <div style="height:1px;background:#334155;margin:12px 0;"></div>
    <span style="font-size:0.72rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Invited To</span>
    <div style="font-size:1.05rem;font-weight:700;color:#6366f1;margin-top:2px;">${tournamentName}</div>
    <div style="font-size:0.8rem;color:#94a3b8;margin-top:2px;">&#128205; ${campus}</div>
  </div>
  <p style="margin:0 0 24px;font-size:0.9rem;color:#94a3b8;line-height:1.6;">
    As the team captain, <strong style="color:#e2e8f0;">only you can accept or decline</strong> this invitation.
    Open the Tournaments section and navigate to the <em>Invitations</em> tab to respond.
  </p>
  <div style="text-align:center;margin-bottom:24px;">
    <a href="${tournamentsUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#38bdf8);color:#fff;font-weight:700;font-size:0.95rem;text-decoration:none;padding:14px 32px;border-radius:12px;">
      &#10003; Respond to Invitation
    </a>
  </div>
  <p style="margin:0;font-size:0.78rem;color:#475569;text-align:center;">
    This message was sent only to you as the registered captain of ${teamName}.<br/>
    If you were not expecting this, you can safely ignore this email.
  </p>
</td></tr>
<tr><td style="background:#0f172a;padding:16px 32px;text-align:center;border-top:1px solid #1e293b;">
  <span style="font-size:0.78rem;color:#475569;">Playr-Pool &middot; College Sports Tournament Platform</span>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  await sendEmail({
    to: captainEmail,
    subject: `🏆 Tournament Invitation: ${tournamentName}`,
    html,
    text,
  });
};
