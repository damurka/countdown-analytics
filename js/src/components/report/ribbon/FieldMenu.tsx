import React from "react";
import { tr } from "../../../lang";
import { editingText, insertField } from "../RichText";
import type { RbField } from "../types";
import { ICONS } from "../ui";
import { Big, Drop, keep, Small } from "../kit/controls";

/** The Field menu (Insert > Quick Parts, Home > Field): the report's fields by group, each with its value now; a click
 *  puts the field where the caret is. */
export function FieldMenu({ catalog, fields, t, lang, big }: { catalog: RbField[]; fields: Record<string, string>; t: (k: string) => string; lang: string; big?: boolean }) {
  const groups: [string, string][] = [
    ["report", t("fieldGroupReport")],
    ["data", t("fieldGroupData")],
    ["coverage", t("fieldGroupCoverage")],
    ["chart", t("fieldGroupChart")]
  ];
  return (
    <Drop
      width={340}
      trigger={(open, toggle) => (big ? <Big icon={ICONS.field} label={t("field")} menu on={open} onClick={toggle} /> : <Small wide icon={ICONS.field} label={t("field")} on={open} onClick={toggle} />)}
    >
      {(close) => (
        <div className="cd-rb-fieldmenu">
          {groups.map(([g, title]) => (
            <div key={g}>
              <div className="cd-rb-fieldmenu__head">{title}</div>
              {catalog
                .filter((f) => f.group === g)
                .map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="menuitem"
                    className="cd-rb-fieldmenu__item"
                    disabled={!editingText()}
                    onMouseDown={keep}
                    onClick={() => {
                      insertField(f.key, fields[f.key]);
                      close();
                    }}
                  >
                    <span>{tr(f.label, lang)}</span>
                    <code>{fields[f.key] ?? "{" + f.key + "}"}</code>
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </Drop>
  );
}
