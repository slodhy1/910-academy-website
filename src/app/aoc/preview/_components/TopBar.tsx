import { Search, Bell } from "lucide-react";
import styles from "../preview.module.css";

// Visual-only Skool-style chrome. Nothing here is interactive: the search field is
// read-only and removed from the tab order, and the nav tabs are plain text, not links.
const NAV_TABS = ["Community", "Classroom", "Calendar", "Members", "Map", "Leaderboards", "About"];
const ACTIVE_TAB = "Classroom";

export function TopBar() {
  return (
    <>
      <div className={styles.topbar}>
        <div className={styles.topbarRow}>
          <div className={styles.brand}>
            {/* 910 Academy logo mark + wordmark */}
            <img src="/logo-white.svg" alt="" width={26} height={26} className={styles.brandLogo} aria-hidden />
            <span className={styles.brandText}>910 Academy</span>
          </div>

          <div className={styles.search} aria-hidden>
            <Search size={16} />
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search"
              tabIndex={-1}
              readOnly
            />
          </div>

          <div className={styles.actions}>
            <span className={styles.iconBtn} aria-hidden>
              <Bell size={18} />
            </span>
            <span className={styles.avatar} aria-hidden>
              A
            </span>
          </div>
        </div>
      </div>

      <nav className={styles.nav} aria-label="Classroom sections (preview)">
        <div className={styles.navInner}>
          {NAV_TABS.map((tab) => {
            const isActive = tab === ACTIVE_TAB;
            return (
              <span
                key={tab}
                className={isActive ? `${styles.navTab} ${styles.navTabActive}` : styles.navTab}
                aria-current={isActive ? "page" : undefined}
              >
                {tab}
              </span>
            );
          })}
        </div>
      </nav>
    </>
  );
}
