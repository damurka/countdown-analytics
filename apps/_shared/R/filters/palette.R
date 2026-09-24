# The colour palette chip for a page's maps (goes in cd_map_options()). `first`: the palette a page opens with (the
# chip shows its first choice); the values are RColorBrewer sequential palettes that cd2030.core's map plots accept.
cd_palette_chip <- function(inputId, i18n, first = "Greens") {
  palettes <- c("opt_palette_greens" = "Greens", "opt_palette_blues" = "Blues", "opt_palette_reds" = "Reds", "opt_palette_purples" = "Purples")
  palettes <- c(palettes[palettes == first], palettes[palettes != first])
  cd_chip_select(inputId, label = "title_global_palette", i18n = i18n, choices = palettes)
}
