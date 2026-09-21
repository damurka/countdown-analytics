getRoots <- function() {
  if (.Platform$OS.type == "windows") {
    # Common drive letters to check (can be extended)
    drives <- paste0(LETTERS, ":/")
    available <- drives[file.exists(drives)]
    set_names(available, available)
  } else {
    c(home = "~", root = "/")
  }
}
