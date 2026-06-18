import styles from "../preview.module.css";

// Visual-only top bar, trimmed to match the AOC landing page: 910 Academy
// logo + wordmark on the left, account avatar on the right. No nav tabs, no
// search field, no notification bell.
export function TopBar() {
  return (
    <div className={styles.topbar}>
      <div className={styles.topbarRow}>
        <div className={styles.brand}>
          <img src="/logo-white.svg" alt="" width={26} height={26} className={styles.brandLogo} aria-hidden />
          <span className={styles.brandText}>910 Academy</span>
        </div>

        <div className={styles.actions}>
          <span className={styles.avatar} aria-hidden>
            A
          </span>
        </div>
      </div>
    </div>
  );
}
