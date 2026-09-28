import { t } from "../i18n/bg";

export function ConnectionBanner() {
  return (
    <div className="banner" role="alert">
      <span className="spinner spinner-small" aria-hidden="true" />
      {t.reconnecting}
    </div>
  );
}
