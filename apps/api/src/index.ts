import { Client } from "pg";
import { createAuth } from "./auth";
import { createDatabase } from "./database";
import { createHandler } from "./http";
import { createProcessor } from "./media";
import { createImageProcessor } from "./image-processing";

export default {
  async fetch(request, env, context) {
    const handle = createHandler({
      auth: createAuth({ url: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY, secretKey: env.SUPABASE_SECRET_KEY }),
      process: createProcessor({ endpoint: env.BEAM_ENDPOINT_URL, apiKey: env.BEAM_API_KEY, outputUrlPrefix: env.BEAM_OUTPUT_URL_PREFIX }),
      processImage: env.IMAGE_PROCESSING_ENDPOINT_URL
        ? createImageProcessor({ endpoint: env.IMAGE_PROCESSING_ENDPOINT_URL, apiKey: env.BEAM_API_KEY, outputUrlPrefix: env.BEAM_OUTPUT_URL_PREFIX })
        : undefined,
      allowedOrigins: env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()),
      // GPU inference keeps its own small budget so cheap CPU demos cannot exhaust it.
      allowTrial: async (operation) => {
        const limiter = operation === "remove-background" ? env.TRIAL_LIMITER : env.TRIAL_IMAGE_LIMITER;

        return (await limiter.limit({ key: "public-demo" })).success;
      },
      async withDatabase(use) {
        const client = new Client({ connectionString: env.DATABASE.connectionString, connectionTimeoutMillis: 10_000, statement_timeout: 10_000 });

        try {
          await client.connect();

          return await use(createDatabase(client));
        } finally {
          await client.end();
        }
      },
    });

    const response = handle(request);

    // Allow accounting to finish after a disconnect, within the runtime's waitUntil limit.
    context.waitUntil(response.then(() => undefined));

    return response;
  },
} satisfies ExportedHandler<Env>;
