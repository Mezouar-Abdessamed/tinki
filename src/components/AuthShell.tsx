import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState, type ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [pressed, setPressed] = useState(0);
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="bg-halo pointer-events-none absolute inset-x-0 top-0 h-96" />
      <div className="relative w-full max-w-md">
        <Link
          to="/"
          onPointerDown={() => setPressed((n) => n + 1)}
          className="group relative inline-flex items-center gap-3 rounded-full border border-border/40 bg-foreground/[0.02] px-5 py-2.5 text-[13px] font-medium tracking-tight text-muted-foreground shadow-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-primary/20 hover:bg-foreground/[0.08] hover:text-foreground hover:shadow-[0_0_20px_-5px_rgba(20,184,166,0.15)] active:scale-[0.94] active:duration-150"
        >
          {pressed > 0 ? (
            <span
              key={pressed}
              className="pointer-events-none absolute inset-0 rounded-full border border-primary/50 animate-ping"
            />
          ) : null}
          <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-primary/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <ArrowLeft className="relative z-10 h-[18px] w-[18px] text-muted-foreground/70 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:-translate-x-1.5 group-hover:text-primary" />
          <span className="relative z-10 transition-colors duration-300">Back to home</span>
          <span className="pointer-events-none absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary/40 opacity-0 blur-[2px] transition-opacity duration-700 group-hover:opacity-100" />
        </Link>
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="font-display text-lg font-bold tracking-tight">
            Link<span className="text-primary">Me</span>
          </span>
        </Link>
        <div className="panel p-7 sm:p-8">
          <h1 className="font-display text-2xl font-semibold">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </main>
  );
}
