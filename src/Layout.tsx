import { useState, useRef, useEffect } from "react";
import { Outlet, NavLink, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Inbox as InboxIcon,
  BookOpen,
  Bot,
  Settings,
  Bell,
  Search,
  Activity,
  Globe,
  Moon,
  Sun,
  X,
  Shield,
  Receipt,
  Film,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useLanguage } from "./i18n";
import { useTheme } from "./theme";
import { getAgentApprovals, getCurrentUser, getInboxMessages } from "./services/db";
import { AppNotification } from "./services/notifications";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Layout() {
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const [pendingAgentCount, setPendingAgentCount] = useState(0);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const currentUser = getCurrentUser();

  const refreshNavCounts = () => {
    setInboxCount(getInboxMessages().length);
    setPendingAgentCount(
      getAgentApprovals().filter((approval) => approval.status === "Pending")
        .length,
    );
  };

  const navigation = [
    { name: t("nav.dashboard"), href: "/", icon: LayoutDashboard },
    { name: t("nav.customers"), href: "/customers", icon: Users },
    { name: t("nav.sales"), href: "/sales", icon: Receipt },
    { name: t("nav.media"), href: "/media", icon: Film },
    { name: t("nav.inbox"), href: "/inbox", icon: InboxIcon, badge: inboxCount },
    {
      name: t("nav.agentCenter"),
      href: "/agent-center",
      icon: Bot,
      badge: pendingAgentCount,
    },
    { name: t("nav.knowledge"), href: "/knowledge", icon: BookOpen },
    ...(currentUser.role === "superadmin"
      ? [
          {
            name: language === "zh" ? "用户管理" : "User Management",
            href: "/users",
            icon: Shield,
          },
        ]
      : []),
  ];

  const notifications = [
    {
      id: 1,
      title: "New Customer Inquiry",
      description: "TechCorp asked about volume discounts.",
      time: "5m, ago",
      unread: true,
    },
    {
      id: 2,
      title: "Agent Completed Task",
      description: "Churn Risk Wake-up workflow finished.",
      time: "1h ago",
      unread: true,
    },
    {
      id: 3,
      title: "Knowledge Base Sync",
      description: "Product Catalog PDF was successfully vectorized.",
      time: "2h ago",
      unread: false,
    },
  ];

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleNotify = (event: Event) => {
      const notification = (event as CustomEvent<AppNotification>).detail;
      setToasts((current) => [...current, notification].slice(-4));
      window.setTimeout(() => {
        setToasts((current) =>
          current.filter((toast) => toast.id !== notification.id),
        );
      }, 4500);
    };

    window.addEventListener("crm:notify", handleNotify);
    return () => window.removeEventListener("crm:notify", handleNotify);
  }, []);

  useEffect(() => {
    refreshNavCounts();

    const handleDataChanged = () => refreshNavCounts();
    window.addEventListener("storage", handleDataChanged);
    window.addEventListener("crm:data-changed", handleDataChanged);

    return () => {
      window.removeEventListener("storage", handleDataChanged);
      window.removeEventListener("crm:data-changed", handleDataChanged);
    };
  }, []);

  const toastStyles = {
    success: {
      icon: CheckCircle2,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    },
    error: {
      icon: AlertTriangle,
      tone: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
    },
    warning: {
      icon: AlertTriangle,
      tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    },
    info: {
      icon: Info,
      tone: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
    },
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setIsNotificationsOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[#050608] text-slate-700 dark:text-slate-300 font-sans overflow-hidden transition-colors">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-black/20 border-r border-slate-200 dark:border-white/5 flex-col hidden md:flex shrink-0 transition-colors">
        <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-white/5 shrink-0 transition-colors">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(37,99,235,0.4)] mr-3">
            <div className="w-4 h-4 border-2 border-white rounded-sm rotate-45"></div>
          </div>
          <span className="text-slate-900 dark:text-white font-semibold text-lg tracking-tight transition-colors">
            AgentCRM{" "}
            <span className="text-blue-500 font-light text-sm">v1.0</span>
          </span>
        </div>
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  isActive
                    ? "bg-blue-50 dark:bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20"
                    : "hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400",
                  "group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-all",
                )
              }
            >
              <item.icon
                className={cn("mr-3 h-5 w-5 shrink-0")}
                aria-hidden="true"
              />
              <span className="flex-1">{item.name}</span>
              {item.badge && (
                <span className="bg-blue-100 dark:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 py-0.5 px-2 rounded-full text-[10px] font-mono">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-200 dark:border-white/5 transition-colors">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                isActive
                  ? "bg-blue-50 dark:bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20"
                  : "hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400",
                "flex w-full items-center px-3 py-2 text-sm font-medium rounded-md transition-all",
              )
            }
          >
            <Settings className="mr-3 h-5 w-5 shrink-0" />
            {t("nav.settings")}
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 shrink-0 bg-white/80 dark:bg-black/40 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-8 z-10 transition-colors">
          <div className="flex-1 flex max-w-xl">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={t("search.placeholder")}
                className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-900 dark:text-slate-200 focus:bg-white dark:focus:bg-white/10 focus:border-blue-500/50 transition-all outline-none"
              />
            </div>
          </div>
          <div className="ml-4 flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center justify-center rounded-full"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => setLanguage(language === "en" ? "zh" : "en")}
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1"
            >
              <Globe className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">
                {language}
              </span>
            </button>
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-full hidden sm:flex transition-colors">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
              <span className="text-xs font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-500">
                {t("sys.active")}
              </span>
            </div>
            <div
              className="flex items-center gap-4 border-l border-slate-200 dark:border-white/10 pl-4 transition-colors relative"
              ref={notificationRef}
            >
              <button
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className={cn(
                  "relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors rounded-full",
                  isNotificationsOpen &&
                    "bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white",
                )}
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.8)]"></span>
              </button>

              {/* Notification Dropdown */}
              {isNotificationsOpen && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                      Notifications
                    </h3>
                    <button className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      Mark all as read
                    </button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={cn(
                          "px-4 py-3 border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors cursor-pointer",
                          notification.unread
                            ? "bg-blue-50/50 dark:bg-blue-900/10"
                            : "",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4
                            className={cn(
                              "text-sm font-medium",
                              notification.unread
                                ? "text-slate-900 dark:text-slate-100"
                                : "text-slate-700 dark:text-slate-300",
                            )}
                          >
                            {notification.title}
                          </h4>
                          <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">
                            {notification.time}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {notification.description}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="p-2 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20">
                    <button className="w-full py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
                      View all notifications
                    </button>
                  </div>
                </div>
              )}

              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="h-8 w-8 rounded-full bg-gradient-to-tr from-slate-200 to-slate-100 dark:from-slate-700 dark:to-slate-500 border border-slate-300 dark:border-white/20 flex items-center justify-center text-slate-800 dark:text-white text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {currentUser.name.substring(0, 2).toUpperCase()}
                </button>

                {/* User Dropdown */}
                {isUserMenuOpen && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-black/20">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {currentUser.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {currentUser.email}
                      </p>
                    </div>
                    <div className="p-2 space-y-1">
                      <Link
                        to="/profile"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="w-full flex items-center px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                      >
                        Profile & Settings
                      </Link>
                      <button
                        onClick={async () => {
                          try {
                            await fetch("/api/logout", { method: "POST" });
                          } catch (e) {}
                          localStorage.removeItem("crm_logged_in");
                          window.location.reload();
                        }}
                        className="w-full flex items-center px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto relative">
          <Outlet />
        </div>

        <div className="fixed right-4 top-20 z-[120] w-[min(360px,calc(100vw-2rem))] space-y-3 pointer-events-none">
          {toasts.map((toast) => {
            const style = toastStyles[toast.type];
            const Icon = style.icon;
            return (
              <div
                key={toast.id}
                className="pointer-events-auto flex gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111318] shadow-xl p-4 animate-in slide-in-from-right-4 fade-in duration-200"
              >
                <div
                  className={cn(
                    "w-9 h-9 rounded-lg border flex items-center justify-center shrink-0",
                    style.tone,
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  {toast.title && (
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {toast.title}
                    </div>
                  )}
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {toast.message}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setToasts((current) =>
                      current.filter((item) => item.id !== toast.id),
                    )
                  }
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors"
                  aria-label="Dismiss notification"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Status Bar */}
        <footer className="h-8 bg-white dark:bg-black border-t border-slate-200 dark:border-white/5 px-6 flex items-center justify-between shrink-0 transition-colors">
          <div className="flex gap-6">
            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
              <span className="text-slate-400 dark:text-slate-600">DB:</span>{" "}
              {t("db.status")}
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
              <span className="text-slate-400 dark:text-slate-600">LLM:</span>{" "}
              {t("llm.status")}
            </div>
          </div>
          <div className="text-[10px] font-mono text-slate-400 dark:text-slate-600 italic cursor-help">
            {t("sys.trace")}
          </div>
        </footer>
      </main>
    </div>
  );
}
