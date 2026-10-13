import Link from "next/link";
import { apiExample } from "@/lib/api-example";

export const metadata = { title: "API documentation" };

export default function DocumentationPage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-16 text-neutral-200">
      <div className="mx-auto max-w-3xl space-y-12">
        <Link href="/" className="text-orange-400 hover:underline">← openBGremover</Link>
        <header className="space-y-4">
          <h1 className="text-4xl font-semibold text-white">API documentation</h1>
          <p>Remove backgrounds with one authenticated request. The API returns image data directly.</p>
        </header>
        <section id="api" className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Process an image</h2>
          <p>Create an API key in your <Link className="text-orange-400 underline" href="/dashboard">dashboard</Link>.
            Set OPENBG_API_URL to your API host and OPENBG_API_KEY to your key. Replace BASE64_IMAGE with the base64-encoded file.</p>
          <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-sm"><code>{apiExample}</code></pre>
          <p>Decode result_image from base64 to save the output. Add return_mask: true to also receive a PNG mask for a static image.</p>
          <p>Supported formats: png, webp, gif, jpg, and jpeg. JPEG composites against white.
            Animated inputs produce GIFs. PNG and WebP preserve soft transparency.</p>
          <p>Add resize_options with max_width and max_height to constrain the output,
            or width and height to choose a target size. keep_aspect defaults to true.</p>
          <p>Uploads are limited to 10 MB and 25 megapixels. Animations allow up to 60 frames and
            60 million total frame pixels. A successful request uses one free or prepaid credit.</p>
        </section>
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Usage and errors</h2>
          <p>Use your API key with GET /api/v1/stats or GET /api/v1/activity to read your usage.
            Key creation, key revocation, and account deletion require a signed-in Supabase session.</p>
          <p>Errors return an error message and error_code. HTTP 400 indicates invalid input;
            401 invalid authentication; 402 exhausted credits; 429 a busy public demo;
            and 502 a processing failure. Failed processing attempts are refunded.</p>
          <p>Requests are synchronous and have no idempotency key. Check activity before retrying
            after a network interruption. Payments are not enabled yet.</p>
        </section>
        <section id="setup" className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Run your own instance</h2>
          <p>The repository contains the Next.js web app, TypeScript/Effect Worker API,
            shared schemas, and a Python GPU worker. Supabase provides Postgres and login.</p>
          <p>The <a className="text-orange-400 underline" href="https://github.com/superuserkalo/openBGremover">repository README</a> covers local setup.
            The migration guide lists Cloudflare Hyperdrive, Supabase, and Beam configuration,
            along with the current limits of synchronous credit accounting.</p>
        </section>
      </div>
    </main>
  );
}
