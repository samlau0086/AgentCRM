import React, { useState, useEffect } from "react";
import { getCurrentUser, setCurrentUser, SystemUser } from "../services/db";
import { User, Lock, Mail, Shield, Save, Loader2 } from "lucide-react";
import { cn } from "../Layout";
import PasswordInput from "../components/PasswordInput";

export default function Profile() {
  const [user, setUser] = useState<SystemUser | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    setName(currentUser.name);
    setEmail(currentUser.email);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    setMessage({ text: "", type: "" });

    try {
      const response = await fetch("/api/users/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setCurrentUser(data.user);
        setUser(data.user);
        setMessage({ text: "Profile updated successfully!", type: "success" });
        setPassword("");
      } else {
        if (response.status === 401) {
          localStorage.removeItem("crm_logged_in");
          window.location.reload();
          return;
        }
        setMessage({
          text: data.error || "Failed to update profile",
          type: "error",
        });
      }
    } catch {
      setMessage({ text: "Network error. Please try again.", type: "error" });
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        setMessage({ text: "", type: "" });
      }, 3000);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Your Profile
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Manage your personal information and security.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden">
        <form onSubmit={handleSave} className="p-6 md:p-8 space-y-8">
          {message.text && (
            <div
              className={cn(
                "p-4 rounded-xl text-sm font-medium",
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
              )}
            >
              {message.text}
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="w-full md:w-1/3 flex flex-col items-center text-center space-y-4">
              <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-white text-5xl font-bold shadow-lg">
                {name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {name}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 capitalize">
                  {user.role} Account
                </p>
              </div>
              <div className="flex items-center justify-center w-full px-4 py-2 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10 text-sm">
                <Shield className="w-4 h-4 mr-2 text-slate-400" />
                <span className="text-slate-600 dark:text-slate-300">
                  Auth: Internal
                </span>
              </div>
            </div>

            <div className="w-full md:w-2/3 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4 border-b border-slate-200 dark:border-white/10 pb-2">
                  Personal Information
                </h3>
                <div className="grid gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-3 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 w-5 h-5 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4 border-b border-slate-200 dark:border-white/10 pb-2 pt-4">
                  Change Password
                </h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    New Password (leave blank to keep current)
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3 w-5 h-5 text-slate-400" />
                    <PasswordInput
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter a new password"
                      className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl pl-11 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    To update your password, just enter a new one above
                    securely.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-6 border-t border-slate-200 dark:border-white/10">
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white px-6 py-2.5 rounded-xl font-medium transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
