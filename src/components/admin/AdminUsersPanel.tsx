import { Fragment, useEffect, useState } from "react";
import { actions, isInputError } from "astro:actions";
import { Trash2, ChevronRight, ChevronDown, TriangleAlert, Video, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  variantId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  visitCount: number | null;
  conversionTimeSeconds: number | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

interface TimelineEvent {
  event: string;
  timestamp: string;
  ctaLocation: string | null;
  errorSource: string | null;
  errorMessage: string | null;
  sessionId: string | null;
  recordingUrl: string | null;
}

interface FunnelStepCount {
  event: string;
  variant: string | null;
  uniquePeople: number;
}

interface OverviewData {
  funnel: FunnelStepCount[];
  emailStats: { total: number; confirmed: number };
}

type LoadState = "checking" | "locked" | "unlocked";

const FUNNEL_STEPS: { event: string; label: string }[] = [
  { event: "landing_page_viewed", label: "Landing viewed" },
  { event: "cta_clicked", label: "CTA clicked" },
  { event: "signup_form_started", label: "Form started" },
  { event: "signup_form_submitted", label: "Form submitted" },
  { event: "account_created", label: "Account created" },
];

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

// { landing_page_viewed: 42, cta_clicked: 18, ... } — summed across variants.
function totalsByStep(funnel: FunnelStepCount[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of funnel) {
    totals[row.event] = (totals[row.event] ?? 0) + row.uniquePeople;
  }
  return totals;
}

// { control: 20, test: 22 } for one funnel step, e.g. "account_created".
function totalsByVariant(funnel: FunnelStepCount[], event: string): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const row of funnel) {
    if (row.event !== event || !row.variant) continue;
    totals[row.variant] = (totals[row.variant] ?? 0) + row.uniquePeople;
  }
  return totals;
}

function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds == null) return "—";
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// PostHog's own automatic events ($pageview, $pageleave, $feature_flag_called,
// etc.) are namespaced with a leading "$" — everything else is an event this
// app captures itself (landing_page_viewed, cta_clicked, account_created…).
function isAutomaticEvent(eventName: string): boolean {
  return eventName.startsWith("$");
}

// Display-only relabeling: cta_clicked fires for every CTA location by
// design (see README's Users API notes), but the navbar one reads clearer
// as its own name in this timeline. Doesn't touch what's actually captured.
function displayEventName(evt: TimelineEvent): string {
  if (evt.event === "cta_clicked" && evt.ctaLocation?.startsWith("navbar")) {
    return "nav_cta_clicked";
  }
  return evt.event;
}

function isErrorEvent(eventName: string): boolean {
  return eventName === "$exception";
}

// Most events in a timeline share the same $session_id (everything from one
// browser session), so this collapses them to one link per session instead
// of repeating the same recording URL on every row.
function uniqueRecordings(events: TimelineEvent[]): { sessionId: string; url: string; firstSeenAt: string }[] {
  const seen = new Map<string, { sessionId: string; url: string; firstSeenAt: string }>();
  for (const evt of events) {
    if (evt.sessionId && evt.recordingUrl && !seen.has(evt.sessionId)) {
      seen.set(evt.sessionId, { sessionId: evt.sessionId, url: evt.recordingUrl, firstSeenAt: evt.timestamp });
    }
  }
  return [...seen.values()];
}

function timelineRowClass(evt: TimelineEvent): string {
  if (isErrorEvent(evt.event)) return "bg-bg-error/25 border border-border-error";
  if (evt.event === "account_created") return "bg-bg-success/15";
  if (evt.event === "$pageleave") return "bg-bg-error/10";
  return "";
}

export default function AdminUsersPanel() {
  const [loadState, setLoadState] = useState<LoadState>("checking");
  const [key, setKey] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [timelineCache, setTimelineCache] = useState<Record<string, TimelineEvent[]>>({});
  const [timelineLoadingId, setTimelineLoadingId] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<Record<string, string>>({});
  const [showOnlyOurs, setShowOnlyOurs] = useState(true);

  const [publicLinks, setPublicLinks] = useState<Record<string, string>>({});
  const [publicLinkLoadingId, setPublicLinkLoadingId] = useState<string | null>(null);
  const [publicLinkError, setPublicLinkError] = useState<Record<string, string>>({});

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  async function fetchOverview() {
    setOverviewLoading(true);
    setOverviewError(null);
    const { data, error } = await actions.users.overview({});
    setOverviewLoading(false);

    if (error) {
      // Don't lock the whole page over this — the user table still works.
      setOverviewError("Could not load the conversion overview.");
      return;
    }
    setOverview(data);
  }

  async function fetchUsers() {
    setRefreshing(true);
    setListError(null);
    const { data, error } = await actions.users.list({ limit: 100 });
    setRefreshing(false);

    if (error) {
      if (error.code === "UNAUTHORIZED") {
        setLoadState("locked");
        return;
      }
      setListError("Could not load users.");
      return;
    }

    setUsers(data.users as UserRow[]);
    setLoadState("unlocked");
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (loadState === "unlocked" && !overview && !overviewLoading) {
      fetchOverview();
    }
  }, [loadState]);

  async function handleLogin(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError(null);

    const { error } = await actions.admin.login({ key });
    setLoggingIn(false);

    if (error) {
      setLoginError("Invalid admin key.");
      return;
    }

    setKey("");
    await fetchUsers();
  }

  async function handleLogout() {
    await actions.admin.logout({});
    setUsers([]);
    setOverview(null);
    setLoadState("locked");
  }

  async function handleRefresh() {
    await Promise.all([fetchUsers(), fetchOverview()]);
  }

  function startEdit(user: UserRow) {
    setConfirmDeleteId(null);
    setEditingId(user.id);
    setEditName(user.name ?? "");
    setRowError((prev) => ({ ...prev, [user.id]: "" }));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  function startDelete(id: string) {
    setEditingId(null);
    setConfirmDeleteId(id);
    setRowError((prev) => ({ ...prev, [id]: "" }));
  }

  function cancelDelete() {
    setConfirmDeleteId(null);
  }

  async function confirmDelete(id: string) {
    setDeletingId(id);
    setRowError((prev) => ({ ...prev, [id]: "" }));

    const { error } = await actions.users.delete({ id });
    setDeletingId(null);

    if (error) {
      const message = error.code === "NOT_FOUND" ? "User no longer exists." : "Could not delete user.";
      setRowError((prev) => ({ ...prev, [id]: message }));
      return;
    }

    setUsers((prev) => prev.filter((u) => u.id !== id));
    setConfirmDeleteId(null);
  }

  async function toggleTimeline(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (timelineCache[id]) return;

    setTimelineLoadingId(id);
    setTimelineError((prev) => ({ ...prev, [id]: "" }));
    const { data, error } = await actions.users.timeline({ id });
    setTimelineLoadingId(null);

    if (error) {
      setTimelineError((prev) => ({ ...prev, [id]: "Could not load timeline." }));
      return;
    }
    setTimelineCache((prev) => ({ ...prev, [id]: data.events }));
  }

  async function generatePublicLink(sessionId: string) {
    setPublicLinkLoadingId(sessionId);
    setPublicLinkError((prev) => ({ ...prev, [sessionId]: "" }));

    const { data, error } = await actions.users.createRecordingLink({ sessionId });
    setPublicLinkLoadingId(null);

    if (error) {
      setPublicLinkError((prev) => ({ ...prev, [sessionId]: "Could not generate a public link." }));
      return;
    }
    setPublicLinks((prev) => ({ ...prev, [sessionId]: data.url }));
  }

  async function saveEdit(id: string) {
    if (editName.trim().length === 0) return;

    setSavingId(id);
    setRowError((prev) => ({ ...prev, [id]: "" }));

    const { data, error } = await actions.users.update({ id, name: editName });
    setSavingId(null);

    if (error) {
      const message = isInputError(error)
        ? "Name can't be empty."
        : error.code === "NOT_FOUND"
          ? "User no longer exists."
          : "Could not save changes.";
      setRowError((prev) => ({ ...prev, [id]: message }));
      return;
    }

    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, name: data.user.name } : u)));
    setEditingId(null);
  }

  if (loadState === "checking") {
    return <p className="text-text-secondary">Checking access…</p>;
  }

  if (loadState === "locked") {
    return (
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle>Admin access</CardTitle>
          <CardDescription>Enter the admin key to manage users.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-key">Admin key</Label>
              <Input
                id="admin-key"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                required
                autoFocus
              />
            </div>
            {loginError && (
              <p role="alert" className="text-sm text-text-error">
                {loginError}
              </p>
            )}
            <Button type="submit" disabled={loggingIn}>
              {loggingIn ? "Checking…" : "Unlock"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const funnelTotals = overview ? totalsByStep(overview.funnel) : {};
  const landingTotal = funnelTotals["landing_page_viewed"] ?? 0;
  const accountTotal = funnelTotals["account_created"] ?? 0;
  const landingByVariant = overview ? totalsByVariant(overview.funnel, "landing_page_viewed") : {};
  const accountByVariant = overview ? totalsByVariant(overview.funnel, "account_created") : {};
  const variants = Object.keys(landingByVariant);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl">Users</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || overviewLoading}>
            {refreshing || overviewLoading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </div>

      {listError && (
        <p role="alert" className="text-sm text-text-error">
          {listError}
        </p>
      )}

      {overviewLoading && !overview && <p className="text-sm text-text-secondary">Loading overview…</p>}
      {overviewError && (
        <p role="alert" className="text-sm text-text-error">
          {overviewError}
        </p>
      )}
      {overview && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <Card size="sm" className="min-w-[150px] flex-1">
              <CardHeader>
                <CardDescription>Overall CVR</CardDescription>
                <CardTitle>{formatPercent(accountTotal, landingTotal)}</CardTitle>
              </CardHeader>
            </Card>
            {variants.map((variant) => (
              <Card key={variant} size="sm" className="min-w-[150px] flex-1">
                <CardHeader>
                  <CardDescription>CVR · {variant}</CardDescription>
                  <CardTitle>
                    {formatPercent(accountByVariant[variant] ?? 0, landingByVariant[variant] ?? 0)}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
            <Card size="sm" className="min-w-[150px] flex-1">
              <CardHeader>
                <CardDescription>Email confirmed</CardDescription>
                <CardTitle>{formatPercent(overview.emailStats.confirmed, overview.emailStats.total)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-bg-secondary px-3 py-2 text-sm text-text-secondary">
            {FUNNEL_STEPS.map((step, i) => {
              const count = funnelTotals[step.event] ?? 0;
              return (
                <span key={step.event} className="flex items-center gap-2">
                  {i > 0 && <span>→</span>}
                  <span>
                    {step.label} <span className="text-text-primary">{count}</span>{" "}
                    <span>({formatPercent(count, landingTotal)})</span>
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg-secondary text-text-secondary">
            <tr>
              <th className="w-8 px-2 py-2 font-medium"></th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Email</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Name</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Source</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Variant</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Visits</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap" title="Time to convert">
                Convert
              </th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Created</th>
              <th className="px-2 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <Fragment key={user.id}>
                <tr className="border-t border-border-primary">
                  <td className="px-2 py-2">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={expandedId === user.id ? "Collapse timeline" : "Expand timeline"}
                      onClick={() => toggleTimeline(user.id)}
                    >
                      {expandedId === user.id ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                    </Button>
                  </td>
                  <td className="max-w-[180px] px-2 py-2">
                    <div className="truncate" title={user.email}>
                      {user.email}
                    </div>
                    <span
                      className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        user.emailVerifiedAt
                          ? "bg-bg-success/20 text-text-success"
                          : "bg-bg-warning/20 text-text-warning"
                      }`}
                    >
                      {user.emailVerifiedAt ? "Verified" : "Not verified"}
                    </span>
                  </td>
                  <td className="max-w-[120px] px-2 py-2">
                    {editingId === user.id ? (
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7" />
                    ) : (
                      <span className="block truncate" title={user.name ?? undefined}>
                        {user.name ?? "—"}
                      </span>
                    )}
                    {rowError[user.id] && (
                      <p role="alert" className="mt-1 text-xs text-text-error">
                        {rowError[user.id]}
                      </p>
                    )}
                  </td>
                  <td className="max-w-[140px] px-2 py-2 text-text-secondary">
                    {user.utmSource ? (
                      <>
                        <div className="truncate">{user.utmSource}</div>
                        {(user.utmMedium || user.utmCampaign) && (
                          <div
                            className="truncate text-xs"
                            title={[user.utmMedium, user.utmCampaign].filter(Boolean).join(" · ")}
                          >
                            {[user.utmMedium, user.utmCampaign].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-2 text-text-secondary">{user.variantId ?? "—"}</td>
                  <td className="px-2 py-2 text-text-secondary">{user.visitCount ?? "—"}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-text-secondary">
                    {formatDuration(user.conversionTimeSeconds)}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-text-secondary">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {editingId === user.id ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveEdit(user.id)}
                          disabled={savingId === user.id || editName.trim().length === 0}
                        >
                          {savingId === user.id ? "Saving…" : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    ) : confirmDeleteId === user.id ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => confirmDelete(user.id)}
                          disabled={deletingId === user.id}
                        >
                          {deletingId === user.id ? "Deleting…" : "Confirm"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelDelete}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => startEdit(user)}>
                          Edit
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Delete ${user.email}`}
                          onClick={() => startDelete(user.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
                {expandedId === user.id && (
                  <tr className="border-t border-border-primary bg-bg-secondary/50">
                    <td colSpan={9} className="px-3 py-3">
                      {timelineLoadingId === user.id ? (
                        <p className="text-sm text-text-secondary">Loading timeline…</p>
                      ) : timelineError[user.id] ? (
                        <p role="alert" className="text-sm text-text-error">
                          {timelineError[user.id]}
                        </p>
                      ) : timelineCache[user.id]?.length ? (
                        <div className="flex flex-col gap-2">
                          {uniqueRecordings(timelineCache[user.id]).length > 0 && (
                            <div className="flex flex-col gap-1.5 text-xs">
                              <span className="text-text-secondary">Session recordings:</span>
                              {uniqueRecordings(timelineCache[user.id]).map((rec) => (
                                <div key={rec.sessionId} className="flex flex-wrap items-center gap-2">
                                  <a
                                    href={rec.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-full bg-bg-secondary px-2 py-0.5 text-text-primary hover:underline"
                                  >
                                    <Video className="size-3" />
                                    {new Date(rec.firstSeenAt).toLocaleString()}
                                  </a>
                                  {publicLinks[rec.sessionId] ? (
                                    <a
                                      href={publicLinks[rec.sessionId]}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 rounded-full bg-bg-success/20 px-2 py-0.5 text-text-success hover:underline"
                                      title="Anyone with this link can view it — no PostHog login required"
                                    >
                                      <Share2 className="size-3" />
                                      Public link ready
                                    </a>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-5 gap-1 px-2 text-xs"
                                      onClick={() => generatePublicLink(rec.sessionId)}
                                      disabled={publicLinkLoadingId === rec.sessionId}
                                    >
                                      <Share2 className="size-3" />
                                      {publicLinkLoadingId === rec.sessionId
                                        ? "Generating…"
                                        : "Generate public link"}
                                    </Button>
                                  )}
                                  {publicLinkError[rec.sessionId] && (
                                    <span role="alert" className="text-text-error">
                                      {publicLinkError[rec.sessionId]}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          <label className="flex w-fit items-center gap-1.5 text-xs text-text-secondary">
                            <input
                              type="checkbox"
                              checked={showOnlyOurs}
                              onChange={(e) => setShowOnlyOurs(e.target.checked)}
                            />
                            Only our events (hide PostHog's automatic ones)
                          </label>
                          <ol className="flex flex-col gap-1 text-sm">
                            {timelineCache[user.id]
                              .filter((evt) => isErrorEvent(evt.event) || !showOnlyOurs || !isAutomaticEvent(evt.event))
                              .map((evt, i) => (
                                <li key={i} className={`rounded px-1.5 py-0.5 ${timelineRowClass(evt)}`}>
                                  <div className="flex items-center gap-3">
                                    <span className="w-44 shrink-0 text-text-secondary">
                                      {new Date(evt.timestamp).toLocaleString()}
                                    </span>
                                    {isErrorEvent(evt.event) && (
                                      <TriangleAlert className="size-3.5 shrink-0 text-text-error" />
                                    )}
                                    <span className={isErrorEvent(evt.event) ? "font-medium text-text-error" : ""}>
                                      {isErrorEvent(evt.event) ? "ALERT — exception" : displayEventName(evt)}
                                    </span>
                                  </div>
                                  {isErrorEvent(evt.event) && evt.errorMessage && (
                                    <p className="mt-0.5 pl-[188px] text-xs text-text-error">
                                      {evt.errorSource && <span className="opacity-80">[{evt.errorSource}] </span>}
                                      {evt.errorMessage}
                                    </p>
                                  )}
                                </li>
                              ))}
                          </ol>
                        </div>
                      ) : (
                        <p className="text-sm text-text-secondary">
                          No PostHog activity found for this user.
                        </p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-text-secondary">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
