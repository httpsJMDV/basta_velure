import { Link } from "react-router-dom";
import { ArrowUpRight, LogOut, MapPin, Warehouse, X } from "lucide-react";
import LovedItLogo from "../../components/LovedItLogo";
import type {
  ShellNavGroup,
  ShellUser,
} from "../../components/shell/PortalChrome";

interface Props {
  nav: ShellNavGroup[];
  collapsed: boolean;
  isActive: (to: string) => boolean;
  onNavigate?: () => void;
  onClose?: () => void;
  hubName: string;
  city?: string;
  user: ShellUser;
  onLogout: () => void;
}

export default function HubSidebar({
  nav,
  collapsed,
  isActive,
  onNavigate,
  onClose,
  hubName,
  city,
  user,
  onLogout,
}: Props) {
  return (
    <div
      className={["hub-sidebar", collapsed ? "hub-sidebar-collapsed" : ""].join(
        " ",
      )}
    >
      <div className="hub-brand-row">
        <Link
          to="/hub/dashboard"
          onClick={onNavigate}
          className="hub-brand"
          aria-label="Loved-IT hub dashboard"
        >
          <span className="hub-brand-mark">
            <LovedItLogo
              variant="light"
              type="icon"
              size="custom"
              showText={false}
              imgClassName="w-7 h-7 object-contain"
            />
          </span>
          {!collapsed && (
            <span>
              <strong>
                Loved-IT<span className="hub-brand-dot">.</span>
              </strong>
              <small>LOGISTICS WORKSPACE</small>
            </span>
          )}
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="hub-mobile-close"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="hub-facility">
          <span className="hub-facility-icon">
            <Warehouse size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p title={hubName}>{hubName}</p>
            <span>
              <MapPin size={11} aria-hidden="true" />
              {city || "Hub operations"}
            </span>
          </div>
        </div>
      )}
      <nav aria-label="Logistics hub" className="hub-navigation">
        {nav.map((group) => (
          <div className="hub-nav-group" key={group.heading}>
            {!collapsed && <p className="hub-nav-heading">{group.heading}</p>}
            {group.items.map(({ icon: Icon, label, to, badge }) => (
              <Link
                key={to}
                to={to}
                onClick={onNavigate}
                title={collapsed ? label : undefined}
                aria-label={collapsed ? label : undefined}
                aria-current={isActive(to) ? "page" : undefined}
                className="hub-nav-link"
              >
                <Icon size={18} aria-hidden="true" />
                {!collapsed && (
                  <>
                    <span>{label}</span>
                    {!!badge && (
                      <span className="hub-nav-badge">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </>
                )}
                {collapsed && !!badge && <span className="hub-nav-dot" />}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      {!collapsed && (
        <Link
          to="/hub/reports"
          onClick={onNavigate}
          className="hub-sidebar-insight"
        >
          <span>Keep your hub moving</span>
          <p>
            See the bigger picture.
            <ArrowUpRight size={16} aria-hidden="true" />
          </p>
        </Link>
      )}
      <div className="hub-sidebar-user">
        <span className="hub-user-avatar">{user.initials}</span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p>{user.name}</p>
            <span>Hub manager</span>
          </div>
        )}
        <button
          type="button"
          onClick={onLogout}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
