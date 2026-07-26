import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routerWithQueryClient } from "@tanstack/react-router-with-query";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // Without this, data fetched into the queryClient during SSR (e.g. any
  // `ensureQueryData` call in a route loader) never reaches the browser: the
  // client mounts with a brand-new, empty QueryClient, so the very first
  // client render recomputes every `useQuery` from scratch and gets
  // `undefined` where the server already had real data. React then finds the
  // server HTML and the client's re-render disagree — a hydration mismatch
  // (this is exactly what caused the Footer's business_settings address to
  // flip between the SSR value and its component-level fallback). This
  // serializes the server's queryClient cache into the response and
  // rehydrates the client's queryClient with it before first render, so both
  // sides start from the same data.
  return routerWithQueryClient(router, queryClient);
};
