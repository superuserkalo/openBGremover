import { Data, Effect } from "effect";

export class ApiError extends Data.TaggedError("ApiError")<{
  code: string;
  message: string;
  status: number;
}> {}

export function attempt<A>(operation: () => Promise<A>) {
  return Effect.tryPromise({
    try: operation,
    catch: (cause) => cause instanceof ApiError
      ? cause
      : new ApiError({ code: "INTERNAL_ERROR", message: "The request could not be completed", status: 500 }),
  });
}

export function errorResponse(error: ApiError) {
  return Response.json({ success: false, error: error.message, error_code: error.code }, { status: error.status });
}
