import type { ComponentProps } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import {
  LiveSynced,
  type StatCardProps,
} from "../../components/admin/dashboardKit";
import { PageHeader as BasePageHeader } from "../../components/admin/dashboardKit";
import { useCountUp } from "../../hooks/useDashboardAnimations";
import { NA, peso, whole } from "../../utils/adminReports";

export {
  CardTag,
  SectionHeader,
  HEADER_BUTTON,
  HEADER_BUTTON_PRIMARY,
} from "../../components/admin/dashboardKit";

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  updatedAt,
  children,
  headingRef,
}: ComponentProps<typeof BasePageHeader>) {
  return (
    <header className="hub-page-header">
      <div className="min-w-0">
        <div className="hub-eyebrow">
          <Icon size={14} aria-hidden="true" /> Hub workspace{" "}
          {updatedAt !== undefined && <LiveSynced updatedAt={updatedAt} />}
        </div>
        <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
          {title}
        </h1>
        {subtitle && <p className="hub-page-description">{subtitle}</p>}
      </div>
      {children && <div className="hub-page-actions">{children}</div>}
    </header>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  money,
  trendEl,
  iconBg,
  iconColor,
  to,
  onClick,
  active,
  actionLabel,
  compact,
}: StatCardProps) {
  const animated = useCountUp(typeof value === "number" ? value : 0);
  const display =
    typeof value === "number"
      ? money
        ? peso(animated)
        : whole(animated)
      : (value ?? NA);
  const className = [
    "hub-stat",
    compact ? "hub-stat-compact" : "",
    active ? "hub-stat-active" : "",
  ].join(" ");
  const body = (
    <>
      <div className="hub-stat-top">
        <span className={["hub-stat-icon", iconBg, iconColor].join(" ")}>
          <Icon size={18} aria-hidden="true" />
        </span>
        {trendEl}
      </div>
      <p className="hub-stat-label">{label}</p>
      <p className="hub-stat-value">{display}</p>
      {subtext && <p className="hub-stat-detail">{subtext}</p>}
      {(to || onClick) && actionLabel && (
        <div className="hub-stat-action">
          {actionLabel}
          <ArrowUpRight size={14} aria-hidden="true" />
        </div>
      )}
    </>
  );
  if (to)
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={className}
      >
        {body}
      </button>
    );
  return <div className={className}>{body}</div>;
}

export function StatCardSkeleton() {
  return (
    <div className="hub-stat animate-pulse" aria-busy="true">
      <div className="w-9 h-9 bg-gray-100 rounded-xl mb-4" />
      <div className="w-24 h-3 bg-gray-100 rounded mb-3" />
      <div className="w-16 h-8 bg-gray-100 rounded mb-3" />
      <div className="w-28 h-3 bg-gray-100 rounded" />
    </div>
  );
}
