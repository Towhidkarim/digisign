import { Link, useRouterState } from "@tanstack/react-router";
import { FileText, LayoutDashboard, LogOut, Plus, Search } from "lucide-react";

import { Logo } from "#/components/logo.tsx";
import { ThemeToggle } from "#/components/theme-toggle.tsx";
import { Button } from "#/components/ui/button.tsx";
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
} from "#/components/ui/sidebar.tsx";
import { authClient } from "#/lib/auth-client.ts";

const NAV = [
	{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ to: "/documents", label: "Documents", icon: FileText },
	{ to: "/verify", label: "Check a PDF", icon: Search },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
	const path = useRouterState({ select: (state) => state.location.pathname });
	return (
		<SidebarProvider>
			<Sidebar collapsible="offcanvas">
				<SidebarHeader className="gap-4 p-4">
					<Logo to="/dashboard" />
					<Button asChild className="w-full">
						<Link to="/prepare">
							<Plus strokeWidth={1.75} />
							Create a document
						</Link>
					</Button>
				</SidebarHeader>
				<SidebarContent>
					<SidebarMenu className="px-2">
						{NAV.map((item) => (
							<SidebarMenuItem key={item.to}>
								<SidebarMenuButton
									asChild
									isActive={
										item.to === "/dashboard"
											? path === "/dashboard"
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
				<SidebarFooter className="p-2">
					<ThemeToggle className="w-full justify-start" />
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								onClick={() => {
									void authClient.signOut().then(() => {
										window.location.assign("/login");
									});
								}}
							>
								<LogOut strokeWidth={1.75} />
								Sign out
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarFooter>
			</Sidebar>
			<SidebarInset>
				<div className="p-3 md:hidden">
					<SidebarTrigger />
				</div>
				<div className="mx-auto w-full max-w-3xl px-6 pt-6 pb-16 md:px-10 md:pt-10">
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
