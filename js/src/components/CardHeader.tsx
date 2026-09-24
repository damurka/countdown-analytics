import React from "react";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";

// box()'s own title/subtitle block (_shared/R/layout/page.R and card.R) -- explicit user request, "replace box() ...
// create custom components": this is the one piece of box()'s header that's safely React-able. The rest of
// box() (the card's own body, its toolbar, the collapse button) has to stay plain HTML/Shiny content -- the
// body in particular can be arbitrary Shiny UI (plots, tables, nested inputs), which a React prop can't carry.
// title/subtitle themselves are LocalText, not plain strings, even though every caller passes i18n$t("...")
// (which live-retranslates a plain HTML <span data-key> on a language switch, via usei18n()'s own DOM scan) --
// box() unwraps that tag back to its own translation key (cd_key(), cd-react.R) and resolves it into LocalText
// itself (cd_text()), so this component re-translates the SAME way every other React text in this app does
// (tr()/useLang()), not by relying on the DOM-scan mechanism that only ever touched plain HTML. The one
// exception -- 1a_checks_reporting_rate.R's own `title = uiOutput(...)`, a genuinely reactive title -- can't
// go through this component at all (uiOutput() is a Shiny render target, not a value, and cd_key() can't
// extract a key from it), so box() keeps its old plain-HTML title path for that one, permanent case.

export interface CardHeaderProps {
  title: LocalText;
  subtitle?: LocalText;
  /** Resolved Font Awesome class, e.g. "fas fa-chart-line" -- see cd_icon_class() (cd-react.R). */
  icon?: string;
}

function CardHeader({ title, subtitle, icon }: CardHeaderProps) {
  const lang = useLang();
  const heading = (
    <h3 className="cd-card__title">
      {icon && <i className={icon} aria-hidden="true" />}
      {tr(title, lang)}
    </h3>
  );
  if (!subtitle) return heading;
  return (
    <div className="cd-card__heading">
      {heading}
      <div className="cd-card__subtitle">{tr(subtitle, lang)}</div>
    </div>
  );
}

export default CardHeader;
