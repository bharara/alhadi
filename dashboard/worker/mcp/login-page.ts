// The OAuth sign-in page: an admin signs in with their dashboard username and password to connect an AI app.
import type { Context } from "hono";
import { html } from "hono/html";

// The /authorize parameters the form posts back.
const CARRIED = ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"];

export function loginPage(c: Context, params: Record<string, string | undefined>, clientName: string, error?: { message: string; status: 401 | 403 | 429 }) {
  return c.html(
    html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connect to Best Builders</title>
<style>
  :root { color-scheme: light; }
  body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #f6f7fb; color: #0e1726; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
  form { background: #fff; padding: 28px; border-radius: 12px; border: 1px solid #e4e7ee; width: min(380px, 100%); box-sizing: border-box; }
  h1 { font-size: 1.15rem; margin: 0 0 6px; }
  p { margin: 0 0 18px; color: #5b6477; font-size: 14px; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
  input:not([type=hidden]) { width: 100%; box-sizing: border-box; padding: 10px 12px; font: inherit; border: 1px solid #d5d9e2; border-radius: 8px; }
  input:focus { outline: 2px solid #eeb13a; border-color: #eeb13a; }
  button { margin-top: 20px; width: 100%; padding: 11px; font: inherit; font-weight: 600; border: 0; border-radius: 8px; background: #eeb13a; color: #1a1103; cursor: pointer; }
  .error { color: #b4232f; background: #fdeef0; padding: 8px 12px; border-radius: 8px; }
  small { display: block; margin-top: 14px; color: #8a92a3; font-size: 12px; }
</style>
</head>
<body>
<form method="post" action="/authorize">
  <h1>Connect ${clientName} to Best Builders</h1>
  <p>Sign in with your dashboard account. ${clientName} will be able to read CRM and website data, add leads and add articles as you. Only admins can connect.</p>
  ${error ? html`<p class="error" role="alert">${error.message}</p>` : ""}
  ${CARRIED.map((name) => (params[name] ? html`<input type="hidden" name="${name}" value="${params[name]}">` : ""))}
  <label for="username">Username</label>
  <input id="username" name="username" type="text" autocomplete="username" value="${params.username ?? ""}" required autofocus>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <button type="submit">Sign in and connect</button>
  <small>Changing your password disconnects every app you connected.</small>
</form>
</body>
</html>`,
    error?.status ?? 200,
    { "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'" },
  );
}
