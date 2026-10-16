# CampusClash production deployment

Deploy the Node server to a persistent host with WebSocket support and a managed PostgreSQL database. Do not use an ephemeral in-memory database or serverless-only functions for Socket.IO.

Set these values in the host's secret/environment-variable settings, not in a repository file:

- `DATABASE_URL` — the newly rotated managed PostgreSQL URL.
- `JWT_SECRET` — a unique random value of at least 32 characters.
- `ADMIN_SIGNUP_CODE` — a strong private code of at least 16 characters.
- `FRONTEND_ORIGIN` and `FRONTEND_URL` — the exact public React origin.
- `RESEND_API_KEY` and `PASSWORD_RESET_EMAIL_FROM` — password-reset email delivery.
- `TRUST_PROXY=true` when one reverse proxy terminates traffic before Node.

Build the React client with `VITE_SOCKET_URL=https://your-node-host` only when it is hosted separately from the API. If both are on the same origin, leave it unset and proxy `/api` plus Socket.IO's `/socket.io` path to Node. This project already uses same-origin API paths, so a reverse proxy avoids exposing a backend URL in the client.

Before launch, rotate the previously exposed database password in the database provider dashboard, replace `DATABASE_URL` in the host configuration, and invalidate the old password. Then run a load test against the deployed Node and PostgreSQL services.

## Rate Limiting & Scaling
The server currently uses an in-memory rate limiter. If more than one instance runs (such as behind a load balancer or horizontally scaled containers), rate limiting must be moved to PostgreSQL or a shared Redis store so that client limits are coordinated across all instances.

