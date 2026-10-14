import api from "../src/index";

/** Temporary benchmark entrypoint; production uses src/index.ts directly. */
export default {
  async fetch(request, env, context) {
    const receivedAt = new Date().toISOString();
    const started = performance.now();
    const original = await api.fetch(request, env, context);
    const response = new Response(original.body, original);

    response.headers.set("X-Benchmark-Duration-Ms", String(Math.round(performance.now() - started)));
    response.headers.set("X-Benchmark-Received-At", receivedAt);
    response.headers.set("X-Benchmark-Request-Id", crypto.randomUUID());

    return response;
  },
} satisfies ExportedHandler<Env>;
