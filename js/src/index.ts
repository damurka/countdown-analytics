import "./lang";
import ChartLabels from "./components/ChartLabels";
import ChartView from "./components/ChartView";
import ChipMulti from "./components/ChipMulti";
import ChipNumber from "./components/ChipNumber";
import ChipSelect from "./components/ChipSelect";

// Components are used from R as shiny.react::reactElement(module = "@/countdown", name = "<Component>", ...)
// -- see cd_react_element() in apps/rmncah/ui/react/cd-react.R.
window.jsmodule = {
  ...window.jsmodule,
  "@/countdown": {
    ChartLabels,
    ChartView,
    ChipMulti,
    ChipNumber,
    ChipSelect,
  },
};
