import { Option, Schema } from "effect";

const AnnouncementSettings = Schema.Struct({
  enabled: Schema.Literal("true"),
  message: Schema.String,
});

export function Announcement() {
  const settings = Schema.decodeUnknownOption(AnnouncementSettings)({
    enabled: process.env.ANNOUNCEMENT_ENABLED,
    message: process.env.ANNOUNCEMENT_MESSAGE,
  });

  if (Option.isNone(settings) || !settings.value.message.trim()) return null;

  return (
    <aside aria-label="Announcement" className="mx-auto max-w-7xl border-x border-border p-3">
      <p className="flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 py-2 text-center text-sm text-primary-foreground">
        {settings.value.message.trim()}
      </p>
    </aside>
  );
}
