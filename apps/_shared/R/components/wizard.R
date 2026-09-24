# The Load Data wizard's step rail (js/src/components/WizardSteps.tsx). `steps`: the list
# compute_step_states() (apps/_shared/R/wizard/step-status.R) returns -- one
# list(key, title_key, status, ...) per step; only key/title_key/status matter to the component, the rest
# (locked/relevant/required) are compute_step_states()'s own bookkeeping for the caller. Clicking a non-locked
# step sends its key as input$inputId, same as any other InputAdapter component -- wizard-panels.R's
# wizard_steps_server() is the one thing that reads it.
cd_wizard_steps <- function(inputId, steps, i18n = cd_i18n()) {
  cd_react_element("WizardSteps", shiny.react::asProps(
    inputId = inputId,
    steps = purrr::map(steps, function(s) list(key = s$key, label = cd_text(i18n, s$title_key), status = s$status))
  ))
}
