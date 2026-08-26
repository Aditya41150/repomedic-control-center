import { cn } from "@/lib/utils";

type Tone = "signal" | "caution" | "critical" | "muted" | "info" | "primary";

const tones: Record<Tone, string> = {
  signal: "border-signal/40 bg-signal/12 text-signal",
  caution: "border-caution/40 bg-caution/12 text-caution",
  critical: "border-critical/45 bg-critical/12 text-critical",
  muted: "border-border bg-muted/60 text-muted-foreground",
  info: "border-info/40 bg-info/12 text-info",
  primary: "border-primary/40 bg-primary/12 text-primary",
};

export function StatusPill({
  tone = "muted",
  children,
  dot = false,
  pulse = false,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] tracking-wide uppercase",
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full bg-current", pulse && "pulse-dot")}
        />
      )}
      {children}
    </span>
  );
}
