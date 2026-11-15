import { cn } from "@/lib/cn";

type Connection = {
  provider: "whoop" | "microsoft";
  name: string;
  connected: boolean;
  configured: boolean;
};

function StatusPill({ connection }: { connection: Connection }) {
  const { connected, configured, name, provider } = connection;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          connected ? "bg-success" : configured ? "bg-gray-300" : "bg-caution",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-brand-darker">{name}</p>
        <p className="text-xs text-gray-500">
          {connected
            ? "Connected"
            : configured
              ? "Not connected"
              : "Needs credentials in .env"}
        </p>
      </div>

      {connected ? (
        <form action="/api/auth/disconnect" method="post">
          <input type="hidden" name="provider" value={provider} />
          <button
            type="submit"
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-darker"
          >
            Disconnect
          </button>
        </form>
      ) : (
        /* brand-mid is the interactive colour. White on brand-mid is 3.60, so
           the label is held at semibold to stay inside the large-text rule. */
        <a
          href={`/api/auth/${provider}`}
          aria-disabled={!configured}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            configured
              ? "bg-brand-mid text-white hover:bg-brand-dark"
              : "pointer-events-none bg-gray-100 text-gray-400",
          )}
        >
          Connect
        </a>
      )}
    </div>
  );
}

export function ConnectionBar({
  connections,
  lastSyncedAt,
  timezone,
}: {
  connections: Connection[];
  lastSyncedAt: Date | null;
  timezone: string;
}) {
  const anyConnected = connections.some((c) => c.connected);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {connections.map((connection) => (
          <StatusPill key={connection.provider} connection={connection} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {lastSyncedAt
            ? `Last synced ${new Intl.DateTimeFormat("en-US", {
                timeZone: timezone,
                hour: "numeric",
                minute: "2-digit",
                month: "short",
                day: "numeric",
              }).format(lastSyncedAt)}`
            : "Not synced yet"}
        </p>

        <form action="/api/sync" method="post">
          <button
            type="submit"
            disabled={!anyConnected}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold tracking-wider transition-colors",
              anyConnected
                ? "bg-brand-darker text-white hover:bg-brand-dark"
                : "cursor-not-allowed bg-gray-100 text-gray-400",
            )}
          >
            Sync now
          </button>
        </form>
      </div>
    </div>
  );
}
