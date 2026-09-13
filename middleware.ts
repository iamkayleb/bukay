import { NextRequest, NextResponse } from "next/server";

import { verifyBookingToken } from "@/app/lib/tokens";

// Next.js Page Server Components can only ever produce a 200, a 3xx
// (redirect()), or a 404 (notFound()) response — there is no API for a page
// to return an arbitrary status. Booking confirmation links need to answer
// with a real HTTP 400 (tampered/missing token) or 410 (expired token)
// before the page ever renders, so that link check tools and non-browser
// clients see the correct status instead of a 200 wrapping an error
// message. Booking-not-found (valid token, no matching booking) is still a
// real 404 via notFound() in app/[slug]/book/confirmed/page.tsx.
export const config = {
  matcher: "/:slug/book/confirmed",
};

function renderErrorHtml(message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bukay</title>
  </head>
  <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#020617;color:#f1f5f9;font-family:system-ui,sans-serif;text-align:center;padding:2rem;">
    <div>
      <h1 style="font-size:1.5rem;font-weight:600;color:#fff;margin:0 0 1rem;">We couldn't verify this link</h1>
      <p style="font-size:0.875rem;color:#cbd5e1;margin:0;">${message}</p>
    </div>
  </body>
</html>`;
}

export async function middleware(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? undefined;
  const result = await verifyBookingToken(token);

  if (result.ok) {
    return NextResponse.next();
  }

  const message =
    result.status === 410
      ? "This confirmation link has expired. Please contact the business for your booking details."
      : "This confirmation link is invalid.";

  return new NextResponse(renderErrorHtml(message), {
    status: result.status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
