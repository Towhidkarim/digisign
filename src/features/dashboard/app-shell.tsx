import { Link, useRouterState } from '@tanstack/react-router';
import { FileText, LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react';

import { Logo } from '#/components/logo.tsx';
import { ThemeToggle } from '#/components/theme-toggle.tsx';
import { Button } from '#/components/ui/button.tsx';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '#/components/ui/sidebar.tsx';
import { authClient } from '#/lib/auth-client.ts';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/verify', label: 'Check a PDF', icon: ShieldCheck },
] as const;

export type ShellUser = { name: string; email: string };

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? '');
  const first = letters[0] ?? '';
  const last = letters.length > 1 ? (letters[letters.length - 1] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/**
 * Signed-in layout: a 248px sidebar that becomes a sheet below 768px, and one content column
 * (max-w-[960px]; pass `wide={false}` for forms and reading pages, max-w-3xl).
 */
export function AppShell({
  user,
  wide = true,
  children,
}: {
  user?: ShellUser;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="px-6 pt-6 pb-4">
          <Logo to="/dashboard" />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu className="gap-1 px-4">
            {NAV.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  className="h-10 gap-3 px-3 [&>svg]:size-5!"
                  isActive={
                    item.to === '/dashboard'
                      ? path === '/dashboard'
                      : path === item.to || path.startsWith(`${item.to}/`)
                  }
                >
                  <Link to={item.to}>
                    <item.icon strokeWidth={1.75} />
                    {item.label}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="mx-4 mb-4 gap-0 border-t border-sidebar-border px-0 pt-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-accent text-small font-semibold text-muted-foreground"
            >
              {user ? initials(user.name) : '?'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email}
              </p>
            </div>
            <ThemeToggle className="size-8 shrink-0" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => {
                void authClient.signOut().then(() => {
                  window.location.assign('/login');
                });
              }}
            >
              <LogOut strokeWidth={1.75} />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex items-center gap-3 border-b border-border px-4 py-2 md:hidden">
          <SidebarTrigger className="size-10" />
          <Logo to="/dashboard" className="text-base" />
        </div>
        <div
          className={`mx-auto w-full px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-10 ${wide ? 'max-w-[960px]' : 'max-w-3xl'}`}
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
