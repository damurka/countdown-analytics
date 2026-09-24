import "./lang";
import "./spinner";
import "./tabswitch";
import "./dialog";
import ChartLabels from "./components/ChartLabels";
import ChartView from "./components/ChartView";
import ChipMulti from "./components/ChipMulti";
import ChipNumber from "./components/ChipNumber";
import ChipSelect from "./components/ChipSelect";
import CardHeader from "./components/CardHeader";
import CdButton from "./components/CdButton";
import CdCheckbox from "./components/CdCheckbox";
import CdTextArea from "./components/CdTextArea";
import DownloadButtonStatus from "./components/DownloadButtonStatus";
import EmptyState from "./components/EmptyState";
import ExpandButton from "./components/ExpandButton";
import FieldNumber from "./components/FieldNumber";
import FieldSelect from "./components/FieldSelect";
import FileUploadZone from "./components/FileUploadZone";
import LoadingSkeleton from "./components/LoadingSkeleton";
import MappingModal from "./components/MappingModal";
import MessageBoxStatus from "./components/MessageBoxStatus";
import StatusBanner from "./components/StatusBanner";
import Tooltip from "./components/Tooltip";
import WizardSteps from "./components/WizardSteps";
import { HeaderBreadcrumb, HeaderActions } from "./components/HeaderBar";
import Sidebar from "./components/Sidebar";

// Components are used from R as shiny.react::reactElement(module = "@/countdown", name = "<Component>", ...)
// -- see cd_react_element() in apps/rmncah/_shared/R/core (and components/).
window.jsmodule = {
  ...window.jsmodule,
  "@/countdown": {
    ChartLabels,
    ChartView,
    ChipMulti,
    ChipNumber,
    ChipSelect,
    CardHeader,
    CdButton,
    CdCheckbox,
    CdTextArea,
    DownloadButtonStatus,
    EmptyState,
    ExpandButton,
    FieldNumber,
    FieldSelect,
    FileUploadZone,
    LoadingSkeleton,
    MappingModal,
    MessageBoxStatus,
    StatusBanner,
    Tooltip,
    WizardSteps,
    HeaderBreadcrumb,
    HeaderActions,
    Sidebar,
  },
};
