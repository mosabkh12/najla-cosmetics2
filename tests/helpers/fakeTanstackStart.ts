// createServerFn()/createMiddleware() only work end-to-end when TanStack
// Start's Vite/Babel plugin has run: it rewrites `.handler(fn)` at build
// time into `.handler(extractedFn, fn)`, where `extractedFn` is a
// generated RPC stub (fetch on the client, manifest lookup on the
// server) and `fn` is the actual code written in each src/api file. A
// plain Vitest run never applies that transform, so calling the real
// createServerFn()-wrapped export directly throws ("No Start context
// found") or silently drops the return value, regardless of what the
// handler itself does.
//
// This is a small, faithful re-implementation of the *runtime contract*
// those two functions expose to application code — validator transforms
// input, middlewares chain via next({context}) exactly like Express/Koa
// middleware, and the handler receives {data, context} — with none of
// the build-time RPC-splitting. It is used only by tests, via
// vi.mock("@tanstack/react-start", ...), so the actual business logic in
// src/api/**.ts (validators, middleware bodies, handlers — everything
// Phase 1-3 changed) runs completely unmodified and for real.

type NextFn = (arg?: { context?: unknown }) => Promise<unknown>;

export interface FakeMiddleware {
  __isFakeMiddleware: true;
  __middlewares: FakeMiddleware[];
  __serverFn?: (opts: { context: unknown; next: NextFn }) => Promise<unknown>;
}

export function createMiddleware(_opts?: unknown) {
  const self: FakeMiddleware & {
    middleware: (mws: FakeMiddleware[]) => typeof self;
    server: (fn: NonNullable<FakeMiddleware["__serverFn"]>) => typeof self;
  } = {
    __isFakeMiddleware: true,
    __middlewares: [],
    __serverFn: undefined,
    middleware(mws) {
      self.__middlewares = mws;
      return self;
    },
    server(fn) {
      self.__serverFn = fn;
      return self;
    },
  };
  return self;
}

// Depth-first flatten: a middleware's own nested .middleware([...]) list
// must fully run (and resolve its context) before that middleware's own
// .server() body runs — this mirrors requireAdmin wrapping
// requireSupabaseAuth in the real app.
function flattenMiddlewares(mws: FakeMiddleware[]): FakeMiddleware[] {
  const flat: FakeMiddleware[] = [];
  for (const m of mws) {
    flat.push(...flattenMiddlewares(m.__middlewares ?? []));
    flat.push(m);
  }
  return flat;
}

function runChain(
  mws: FakeMiddleware[],
  initialContext: unknown,
  finalFn: (context: unknown) => Promise<unknown>,
): Promise<unknown> {
  const chain = flattenMiddlewares(mws);
  function step(index: number, context: unknown): Promise<unknown> {
    if (index >= chain.length) return finalFn(context);
    const mw = chain[index]!;
    const next: NextFn = async (arg) => {
      const nextContext = arg && "context" in arg ? arg.context : context;
      return step(index + 1, nextContext);
    };
    if (!mw.__serverFn) return next();
    return mw.__serverFn({ context, next });
  }
  return step(0, initialContext);
}

interface FakeServerFnBuilder {
  middleware: (mws: FakeMiddleware[]) => FakeServerFnBuilder;
  validator: (fn: (d: unknown) => unknown) => FakeServerFnBuilder;
  handler: (
    fn: (opts: { data: unknown; context: unknown }) => unknown,
  ) => (opts?: { data?: unknown }) => Promise<unknown>;
}

export function createServerFn(_opts?: unknown): FakeServerFnBuilder {
  let middlewares: FakeMiddleware[] = [];
  let validatorFn: ((d: unknown) => unknown) | undefined;

  const builder: FakeServerFnBuilder = {
    middleware(mws) {
      middlewares = mws;
      return builder;
    },
    validator(fn) {
      validatorFn = fn;
      return builder;
    },
    handler(handlerFn) {
      return async (opts?: { data?: unknown }) => {
        const data = validatorFn ? validatorFn(opts?.data) : opts?.data;
        return runChain(middlewares, undefined, (context) => {
          return Promise.resolve(handlerFn({ data, context }));
        });
      };
    },
  };
  return builder;
}
