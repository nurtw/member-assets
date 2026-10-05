import {
  Building2,
  Bus,
  ChartColumn,
  FileText,
  Gauge,
  IdCard,
  KeyRound,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Receipt,
  ScanLine,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { NavIcon } from "@/lib/navigation";

/** The drawing for each icon the navigation table names. */
export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  overview: LayoutDashboard,
  verify: ScanLine,
  applications: FileText,
  cards: IdCard,
  vehicles: Bus,
  fees: Receipt,
  settlement: Landmark,
  organisations: Building2,
  profiles: ListChecks,
  limits: Gauge,
  officers: Users,
  roles: KeyRound,
  security: ShieldCheck,
  account: UserRound,
  usage: ChartColumn,
};
