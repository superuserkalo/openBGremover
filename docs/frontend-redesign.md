# Media website redesign, 14 October 2026

## Reference study

Reference: https://www.firecrawl.dev/ and its playground, reviewed live alongside the supplied screenshots.

The reference uses a pale neutral ground, a continuous bordered grid, generous empty grid rows, compact navigation, dark large type, and orange for actions and headline emphasis. The products menu separates endpoints from client interfaces. Hovered navigation gains a neutral background. Product rows keep the description beside their destination. The hero includes changing canvas textures and a compact input with operation tabs. The playground expands that same interaction instead of introducing a separate design language.

Copy moves from a concrete job to a usable demonstration, then code, capabilities, and questions. Headlines name outcomes. Supporting text names inputs and outputs. CTAs name the action. We adopt that rhythm, not Firecrawl's claims, customer logos, or metrics.

## Direction and content

The user's explicit Firecrawl reference takes priority over taste-skill's random direction and rules against grids, accent text, section numbers, and pixel ornament. Use its readability, honest proof, responsive inspection, and interaction guidance. Tailwind handles all component styling. Global CSS contains only Tailwind imports and shadcn theme tokens.

Subject inventory: openBGremover, one authenticated HTTP API, image uploads, transparent alpha, full source pixels, PNG output, API keys, public trial proxy, open source, and a five-tool media catalog.

Idea: an image's pixels become the site's animated material, surrounding a real upload tool.

Page argument and copy deck:

- Hero: Give your agents media tools. Remove image backgrounds through one API. Try it here, then use it in your app. Proof is the functioning uploader beside the copy.
- Operations: Your media. Ready for what comes next. Remove backgrounds, compress, upscale, convert, and extract text. Roadmap badges are removed. Processing availability remains enforced by the composer action.
- API: From upload to output. One API call. Show concise Python and Node client calls alongside the HTTP request, with working language tabs and copy.
- Output: Keep the details. Lose the background. Explain soft alpha, source resolution, and output formats without superiority claims.
- Integration: Built for your next workflow. Use the HTTP entry point through source-installable Node and Python clients. Native MCP and CLI are not advertised.
- FAQ: Explain availability, limits, transparency, free trial and API usage.
- Final action: Try your first image. Opens the same playground.

Hero has copy on the left and an upload composer on the right. The playground reuses the same processing component. No added retry, inference warmup, paid operation, or billing change.

## Composer refinement and verification

The composer follows the reference's compact three-row structure: open image input, inset operation selector, then attachment, code, and primary action controls. Selected images become thumbnail attachments. Results render below the composer. Mobile shows all four operation labels without horizontal clipping. The hero copy frames the product as a media API for apps and agents.

Verified locally on 14 October 2026:

- `npm run check` passed strict TypeScript, Oxlint, and 18 tests.
- `npm run build:web` passed with static marketing routes and a dynamic playground.
- Browser checks at 1440 and 390 pixels covered the composer, mobile navigation, operation selection, retained attachments, code language selection and copying, FAQ expansion, and full-width products navigation.
- A public-domain astronaut fixture was uploaded through the local trial proxy to the configured live image service. The first raw-body attempt was rejected. Restoring the existing multipart request succeeded. The returned download was verified as a 512 × 512 RGBA PNG. The comparison slider responded to keyboard input.
- vgpu rendered the shader in the browser. Shader loading is deferred until near the viewport, drawing pauses offscreen and in hidden tabs, and reduced motion uses a static time value. A CSS grid remains when WebGPU is unavailable.
- Screenshots are saved under ignored `artifacts/redesign/`. This is local frontend verification, not a deployment or a model-quality benchmark. Account flows received theme changes only and were not live-authenticated in this pass.

## Hero simplification

Removed the composer footer links, example action, code action, future-tool paragraph, and hero proof tagline. The composer now has two rows: attachment input, then operation tabs and one icon action. Expected future-tool availability is represented by a disabled action rather than extra prose. The hero's secondary action is an accessible agent dropdown with Claude Code, Codex, and Cursor branding. Selection copies a setup prompt for the existing HTTP integration, not a claim of a native MCP connection. Brand SVGs are from Lobe Icons, with the MIT license stored beside them.

Replaced scissors in the operation selector with a scan-frame icon and created a separate geometric media mark for the header and footer. Increased shader glyph size, contrast, and motion speed. Two stable-viewport browser captures showed changing texture pixels, with mean channel difference 4.50/255 over the captured region. This confirms rendered movement, not GPU performance or universal browser support.

## SDK and agent refinement

Inspected Firecrawl's live language switch on 14 October 2026. The transition
scrambles individual characters and settles into the new source. The local code
example now uses the same visual treatment over 540 ms, preserves whitespace and
punctuation, copies the final code, and skips scrambling for reduced motion.

Added Node and Python clients with file or byte input, decoded output, save
helpers, response validation, typed HTTP errors, timeouts, and no processing
retries. Node reuses the shared Effect contracts. Both packages are built and
tested locally, not published to registries. Installation is documented in
`docs/sdks.md`.

The composer, products menu, and product grid include OCR. Pi and OpenCode join
the agent menu, with a separate Setup for Agents action. Every entry copies
`Read and follow <site origin>/agent-onboarding/SKILL.md`. The public document
uses our actual API contract and source package instructions. It does not
provision credentials or claim a native agent integration.

Verification: 25 TypeScript tests, four Python local HTTP tests, strict typecheck,
Oxlint, Next production build, npm package import smoke test, and Python wheel
build passed. Browser checks covered desktop and 390px composer layout,
character diffusion, settled syntax highlighting, copy feedback, and the six-entry
agent menu. The served onboarding content matches its source file.
Background removal remains the only implemented processing endpoint. OCR and
the other media operations are catalog entries with disabled processing actions.
No new backend routes, paid inference calls, commits, or deployment in this pass.
