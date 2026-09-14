import { useEffect, useState } from "react";
import { actions, isInputError } from "astro:actions";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

type LoadState = "checking" | "locked" | "unlocked";

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
    setLoadState("locked");
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl">Users</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
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

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg-secondary text-text-secondary">
            <tr>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-border-primary">
                <td className="px-3 py-2">{user.email}</td>
                <td className="px-3 py-2">
                  {editingId === user.id ? (
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7" />
                  ) : (
                    (user.name ?? "—")
                  )}
                  {rowError[user.id] && (
                    <p role="alert" className="mt-1 text-xs text-text-error">
                      {rowError[user.id]}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 text-text-secondary">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 text-right">
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
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-text-secondary">
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
