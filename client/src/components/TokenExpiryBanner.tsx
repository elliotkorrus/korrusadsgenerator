import { trpc } from "../lib/trpc";
import { AlertTriangle, XCircle } from "lucide-react";

export default function TokenExpiryBanner() {
  const { data: status } = trpc.meta.tokenStatus.useQuery(undefined, {
    refetchInterval: 1000 * 60 * 60, // 1 hour
  });

  if (!status || (!status.isExpired && !status.isExpiringSoon)) {
    return null;
  }

  const isExpired = status.isExpired;
  const formattedDate = status.expiresAt
    ? new Date(status.expiresAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div
      className="flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-medium"
      style={{
        background: isExpired
          ? "rgba(248, 81, 73, 0.12)"
          : "rgba(245, 158, 11, 0.12)",
        borderBottom: `1px solid ${isExpired ? "rgba(248, 81, 73, 0.25)" : "rgba(245, 158, 11, 0.25)"}`,
        color: isExpired ? "#f85149" : "#f59e0b",
      }}
    >
      {isExpired ? (
        <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      )}
      <span>
        {isExpired
          ? `Meta access token expired${formattedDate ? ` on ${formattedDate}` : ""}. Update it in Meta Settings to resume ad uploads.`
          : `Meta access token expires${formattedDate ? ` on ${formattedDate}` : ""} (${status.daysRemaining} day${status.daysRemaining === 1 ? "" : "s"} remaining). Refresh it in Meta Settings to avoid disruption.`}
      </span>
    </div>
  );
}
