function bindTabSwitch() {
  const Shiny = (window as { Shiny?: any }).Shiny;
  if (!Shiny || typeof Shiny.addCustomMessageHandler !== "function") {
    setTimeout(bindTabSwitch, 50);
    return;
  }

  Shiny.addCustomMessageHandler(
    "cd-tab-switch",
    ({ containerId, activeKey }: { containerId: string; activeKey: string }) => {
      const container = document.getElementById(containerId);
      if (!container) return;

      let shown: Element | null = null;
      Array.from(container.children).forEach((pane) => {
        if (!(pane instanceof HTMLElement) || !pane.classList.contains("cd-tabpane")) return;
        const isActive = pane.dataset.tabKey === activeKey;
        pane.classList.toggle("cd-tabpane--active", isActive);
        if (isActive) shown = pane;
      });

      if (shown) {
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event("resize"));
          const jq = (window as { jQuery?: any }).jQuery;
          if (jq) jq(window).trigger("resize");
        });
      }
    }
  );
}
bindTabSwitch();
