import { Link, useLocation } from "@tanstack/react-router";
import { Home, Camera, Clock, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-stretch md:items-center justify-center md:py-8">
      {/* Ambient orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="relative w-full md:w-[420px] md:h-[860px] md:rounded-[3rem] md:overflow-hidden md:border md:border-white/10 md:shadow-2xl bg-background/40 flex flex-col">
        <main className="flex-1 overflow-y-auto scrollbar-hide pb-24">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  const items = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/capture", icon: Camera, label: "Capture" },
    { to: "/timeline", icon: Clock, label: "Timeline" },
    { to: "/insights", icon: Sparkles, label: "Insights" },
  ];
  return (
    <nav className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-2">
      <div className="glass-strong rounded-3xl px-2 py-2 flex items-center justify-around">
        {items.map(({ to, icon: Icon, label }) => {
          const active = pathname === to || (to !== "/" && pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className="relative flex flex-col items-center gap-1 px-4 py-2 rounded-2xl"
            >
              {active && (
                <motion.div
                  layoutId="navpill"
                  className="absolute inset-0 rounded-2xl gradient-reef opacity-90"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon className={`relative h-5 w-5 ${active ? "text-primary-foreground" : "text-muted-foreground"}`} />
              <span className={`relative text-[10px] font-medium ${active ? "text-primary-foreground" : "text-muted-foreground"}`}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
