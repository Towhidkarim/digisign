import Add01Icon from "@hugeicons/core-free-icons/Add01Icon";
import DashboardSquare01Icon from "@hugeicons/core-free-icons/DashboardSquare01Icon";
import File01Icon from "@hugeicons/core-free-icons/File01Icon";
import Logout01Icon from "@hugeicons/core-free-icons/Logout01Icon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useRouterState } from "@tanstack/react-router";

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
	{ to: "/dashboard", label: "Dashboard", icon: DashboardSquare01Icon },
	{ to: "/documents", label: "Documents", icon: File01Icon },
	{ to: "/verify", label: "Check a PDF", icon: Search01Icon },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
	const path = useRouterState({ select: (state) => state.location.pathname });
	return (
		<SidebarProvider>
			<Sidebar collapsible="offcanvas">
				<SidebarHeader className="gap-4 p-4">
					<Link
						to="/dashboard"
						className="flex items-center gap-2.5 font-semibold text-sidebar-foreground no-underline hover:text-sidebar-foreground"
					>
						<span className="grid size-8 place-items-center rounded-lg bg-primary text-sm text-primary-foreground">
							D
						</span>
						DigiSign
					</Link>
					<Button asChild className="w-full">
						<Link to="/prepare">
							<HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
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
										<HugeiconsIcon
											icon={item.icon}
											size={16}
											strokeWidth={1.75}
										/>
										{item.label}
									</Link>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarContent>
				<SidebarFooter className="p-2">
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								onClick={() => {
									void authClient.signOut().then(() => {
										window.location.assign("/login");
									});
								}}
							>
								<HugeiconsIcon
									icon={Logout01Icon}
									size={16}
									strokeWidth={1.75}
								/>
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
