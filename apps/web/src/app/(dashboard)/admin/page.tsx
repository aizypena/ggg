import { requireUser } from "@/lib/auth-guards";
import { getAdminOverview } from "@/server/services/admin";
import { LogoutButton } from "@/components/ui/LogoutButton";

export default async function AdminPage() {
  await requireUser("ADMIN");
  const o = await getAdminOverview();

  return (
    <main className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)">
      {/* Header with title and logout button */}
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-bold -tracking-[0.02em] text-on-surface">Admin</h1>
        <LogoutButton />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
        <div className="glass-panel rounded-xl p-6">
          <p className="label-caps text-on-surface-variant">Users</p>
          <p className="data-mono mt-2 text-3xl text-acid-yellow">{o.userCount}</p>
        </div>
        {(["DRAFT", "ACTIVE", "FINISHED", "CANCELLED"] as const).map((s) => (
          <div key={s} className="glass-panel rounded-xl p-6">
            <p className="label-caps text-on-surface-variant">{s}</p>
            <p className="data-mono mt-2 text-3xl text-acid-yellow">{o.byStatus[s]}</p>
          </div>
        ))}
      </div>

      <section aria-label="User list" className="mt-10">
        <h2 className="label-caps mb-4 text-on-surface-variant">Users</h2>
        <table className="w-full">
          <thead>
            <tr className="label-caps text-left text-on-surface-variant">
              <th className="py-2 pr-4">Username</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {o.users.map((u) => (
              <tr key={u.id} className="text-on-surface">
                <td className="data-mono py-3 pr-4">{u.username}</td>
                <td className="py-3 pr-4">{u.role}</td>
                <td className="py-3 text-on-surface-variant">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
