"use client";

import React, { useEffect, useState } from "react";
import { getSupabase } from "@/lib/providers/supabase-client";

export type UserRoleRow = {
  email: string;
  role: "super_admin" | "admin" | "simple_user";
  created_at?: string;
};

export default function SuperAdminDashboard() {
  const [users, setUsers] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"super_admin" | "admin" | "simple_user">("admin");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const fetchUserRoles = async () => {
    setLoading(true);
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("user_roles")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setUsers(data as UserRoleRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUserRoles();
  }, []);

  const handleRoleChange = async (email: string, targetRole: "super_admin" | "admin" | "simple_user") => {
    setNotice(null);
    setErrorNotice(null);
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase
      .from("user_roles")
      .upsert({ email, role: targetRole, updated_at: new Date().toISOString() });

    if (error) {
      setErrorNotice(`Failed to update role: ${error.message}`);
    } else {
      setNotice(`Updated role for ${email} to ${targetRole.toUpperCase()}`);
      setUsers((prev) =>
        prev.map((u) => (u.email === email ? { ...u, role: targetRole } : u))
      );
    }
  };

  const handleAddUserRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setNotice(null);
    setErrorNotice(null);

    const supabase = getSupabase();
    if (!supabase) return;

    const emailToInsert = newEmail.trim().toLowerCase();

    const { error } = await supabase
      .from("user_roles")
      .upsert({ email: emailToInsert, role: newRole, updated_at: new Date().toISOString() });

    if (error) {
      setErrorNotice(`Failed to add user: ${error.message}`);
    } else {
      setNotice(`Successfully assigned ${newRole.toUpperCase()} to ${emailToInsert}`);
      setNewEmail("");
      fetchUserRoles();
    }
  };

  const handleRevoke = async (email: string) => {
    if (!confirm(`Are you sure you want to revoke all admin rights for ${email}?`)) return;
    setNotice(null);
    setErrorNotice(null);

    const supabase = getSupabase();
    if (!supabase) return;

    // Set role to simple_user
    const { error } = await supabase
      .from("user_roles")
      .update({ role: "simple_user" })
      .eq("email", email);

    if (error) {
      setErrorNotice(`Failed to revoke rights: ${error.message}`);
    } else {
      setNotice(`Revoked admin access for ${email}. Set to SIMPLE USER.`);
      setUsers((prev) =>
        prev.map((u) => (u.email === email ? { ...u, role: "simple_user" } : u))
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#070d19] text-[#f2f6fc] font-sans pb-24">
      {/* Top Header */}
      <header className="border-b border-[#1c2e54]/60 bg-[#0c1730]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-xl shadow-lg shadow-amber-500/20">
              👑
            </span>
            <div>
              <h1 className="stat-display text-xl font-black uppercase tracking-wider text-white">
                Volley<span className="text-amber-400">Verse</span> Super Admin
              </h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                System Role & Permissions Control Panel
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/console"
              className="rounded-xl border border-blue-500/30 bg-blue-600/20 px-3.5 py-1.5 text-xs font-bold text-blue-400 hover:bg-blue-600/30 transition-all"
            >
              ← Staff Console
            </a>
            <a
              href="/"
              className="rounded-xl border border-slate-700 bg-slate-800/40 px-3.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700/60 transition-all"
            >
              Public Site
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 space-y-8">
        {/* Status Banners */}
        {notice && (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs font-bold text-emerald-400 flex items-center justify-between">
            <span>✅ {notice}</span>
            <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}

        {errorNotice && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs font-bold text-rose-400 flex items-center justify-between">
            <span>⚠️ {errorNotice}</span>
            <button onClick={() => setErrorNotice(null)} className="text-slate-400 hover:text-white">✕</button>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-[#0c1730] p-5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Super Admins</span>
            <div className="stat-display text-3xl font-black text-white mt-1">
              {users.filter((u) => u.role === "super_admin").length}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Full System & User Control</p>
          </div>

          <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-b from-blue-500/10 to-[#0c1730] p-5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Console Admins</span>
            <div className="stat-display text-3xl font-black text-white mt-1">
              {users.filter((u) => u.role === "admin").length}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Scorekeepers & League Operators</p>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-800/20 to-[#0c1730] p-5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Simple Users</span>
            <div className="stat-display text-3xl font-black text-white mt-1">
              {users.filter((u) => u.role === "simple_user").length}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Fans & Spectators</p>
          </div>
        </div>

        {/* Add User Role Form */}
        <div className="rounded-3xl border border-[#1c2e54] bg-[#0c1730] p-6 shadow-xl">
          <h2 className="stat-display text-sm font-bold uppercase tracking-wider text-slate-300 mb-3">
            Grant User Role / Add Admin
          </h2>

          <form onSubmit={handleAddUserRole} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              placeholder="Enter user email (e.g. staff@gmail.com)"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="flex-1 rounded-xl border border-[#1c2e54] bg-[#070e20] px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
              required
            />

            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as any)}
              className="rounded-xl border border-[#1c2e54] bg-[#070e20] px-4 py-2.5 text-xs text-amber-400 font-bold focus:border-amber-500 focus:outline-none"
            >
              <option value="admin">🛡️ Admin (Console Staff)</option>
              <option value="super_admin">👑 Super Admin (Full Control)</option>
              <option value="simple_user">👤 Simple User (Fan)</option>
            </select>

            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:from-amber-400 hover:to-amber-500 shadow-lg shadow-amber-500/20 transition-all"
            >
              Assign Role ⚡
            </button>
          </form>
        </div>

        {/* User Directory Table */}
        <div className="rounded-3xl border border-[#1c2e54] bg-[#0c1730] p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="stat-display text-sm font-bold uppercase tracking-wider text-slate-300">
              User Roles Directory
            </h2>
            <button
              onClick={fetchUserRoles}
              className="text-xs font-bold text-blue-400 hover:underline"
            >
              🔄 Refresh List
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading user roles...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-[#1c2e54] text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">User Email</th>
                    <th className="py-3 px-4">Current Role</th>
                    <th className="py-3 px-4">Change Role (1-Click)</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2e54]/40">
                  {users.map((u) => (
                    <tr key={u.email} className="hover:bg-[#142347]/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-white">
                        {u.email}
                      </td>

                      <td className="py-3.5 px-4">
                        {u.role === "super_admin" && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 px-2.5 py-1 text-[10px] font-black uppercase text-amber-400 border border-amber-500/30">
                            👑 Super Admin
                          </span>
                        )}
                        {u.role === "admin" && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-blue-500/20 px-2.5 py-1 text-[10px] font-black uppercase text-blue-400 border border-blue-500/30">
                            🛡️ Admin (Staff)
                          </span>
                        )}
                        {u.role === "simple_user" && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-400 border border-slate-700">
                            👤 Simple User
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.email, e.target.value as any)}
                          className="rounded-lg border border-[#1c2e54] bg-[#070e20] px-3 py-1 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
                        >
                          <option value="super_admin">👑 Super Admin</option>
                          <option value="admin">🛡️ Admin</option>
                          <option value="simple_user">👤 Simple User</option>
                        </select>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        {u.role !== "simple_user" ? (
                          <button
                            onClick={() => handleRevoke(u.email)}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20 transition-all"
                          >
                            Revoke Admin
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRoleChange(u.email, "admin")}
                            className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-blue-400 hover:bg-blue-500/20 transition-all"
                          >
                            + Make Admin
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-xs text-slate-500">
                        No roles configured in database yet. Run SQL migration to seed initial roles.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
