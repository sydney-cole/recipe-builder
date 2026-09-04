import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isAppRoute = createRouteMatcher(["/app(.*)"]);
const isAuthRoute = createRouteMatcher(["/sign-in", "/sign-up"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isAuthenticated = await convexAuth.isAuthenticated();

  if (isAppRoute(request) && !isAuthenticated) {
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return nextjsMiddlewareRedirect(
      request,
      `/sign-in?next=${encodeURIComponent(next)}`,
    );
  }

  if (isAuthRoute(request) && isAuthenticated) {
    return nextjsMiddlewareRedirect(request, "/app");
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
