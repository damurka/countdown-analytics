# The full-page "app is loading" cover shown until Shiny has drawn the first screen (replaces waiter's
# waiterShowOnLoad() + hostess loader + the server-side hostess$close()/waiter_hide() pair: nothing on the server
# is needed any more). cd_app_ui() puts it first in <body> (do not add it to an app yet again). It removes itself on the first `shiny:idle` (all initial outputs settled), or after
# `timeout` seconds at the latest so a page that never goes idle is never stuck behind it. Its own critical
# style is inline so it covers the page even before cd-ui.css has applied.
cd_startup_loader <- function(messages = c(
                                "We are loading the app. Fetching stardust...",
                                "The app is almost ready. Summoning unicorns...",
                                "Hold on, the app is being loaded! Chasing rainbows...",
                                "We are loading the app: teaching squirrels to water ski...",
                                "App is loading! Counting clouds..."
                              ),
                              timeout = 20) {
  tagList(
    tags$style(HTML(".cd-startup{position:fixed;inset:0;z-index:3000;background:#fff}")),
    div(
      id = "cd-startup", class = "cd-startup", role = "status", `aria-live` = "polite",
      div(
        class = "cd-startup__box",
        tags$img(class = "cd-startup__logo", src = "cd-ui/countdown-mark.png", alt = "", width = "72", height = "72"),
        div(class = "cd-startup__spinner", `aria-hidden` = "true"),
        p(class = "cd-startup__text", sample(messages, 1))
      )
    ),
    tags$script(HTML(sprintf("
      (function() {
        var gone = false;
        function hide() {
          if (gone) return;
          gone = true;
          var el = document.getElementById('cd-startup');
          if (!el) return;
          el.classList.add('cd-startup--done');
          setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
        }
        document.addEventListener('DOMContentLoaded', function() {
          if (window.jQuery) window.jQuery(document).one('shiny:idle', hide);
          setTimeout(hide, %d);
        });
      })();
    ", as.integer(timeout * 1000))))
  )
}
