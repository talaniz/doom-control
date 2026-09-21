/** Read-only project metadata. Keep task DOM mounted while this view is open. */
export function createProjectsView({ root, read, intervalMs = 15000 }) {
  const doc = root.ownerDocument;
  let active = false,
    generation = 0,
    timer = null,
    pending = false,
    last = null,
    selected = null;
  function node(tag, text, cls) {
    const n = doc.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function button(text, action, key = text) {
    const b = node("button", text, "quiet");
    b.dataset.focusKey = key;
    b.type = "button";
    b.onclick = action;
    return b;
  }
  function link(label, url) {
    const a = node("a", label);
    a.href = url;
    a.dataset.focusKey = url;
    a.rel = "noopener noreferrer";
    return a;
  }
  function field(parent, label, value) {
    const line = node("p");
    line.append(
      node("strong", `${label}: `),
      doc.createTextNode(String(value)),
    );
    parent.append(line);
  }
  function job(parent, label, value) {
    const section = node("div", undefined, "project-work");
    section.append(node("h3", label));
    if (!value)
      section.append(
        node(
          "p",
          label === "Active work"
            ? "No active work"
            : "No completed outcome recorded",
        ),
      );
    else {
      field(section, "Stage", value.stage);
      section.append(link("Issue", value.issueUrl));
      if (value.prUrl)
        section.append(
          doc.createTextNode(" · "),
          link("Pull request", value.prUrl),
        );
      if (value.at) field(section, "Recorded", value.at);
    }
    parent.append(section);
  }
  function render(loading = false) {
    const focused = root.contains(doc.activeElement)
      ? doc.activeElement.dataset.focusKey
      : null;
    try {
      root.replaceChildren();
      const heading = node("header");
      const title = node("div");
      title.append(
        node("p", "PRIME MOVER / TRACKING", "eyebrow"),
        node("h1", "Projects"),
        node("p", "Read-only project status.", "muted"),
      );
      const refresh = button(loading ? "Refreshing…" : "Refresh projects", () =>
        refreshData(),
      );
      refresh.disabled = loading;
      heading.append(title, refresh);
      root.append(heading);
      if (loading) {
        const status = node("p", "Loading projects…", "project-status");
        status.setAttribute("role", "status");
        root.append(status);
      }
      if (!last) return;
      const { snapshot } = last;
      const age = snapshot
        ? Date.now() - Date.parse(snapshot.observedAt)
        : Infinity;
      const state =
        last.state === "fresh" &&
        (age > snapshot.freshnessSeconds * 1000 || age < -5000)
          ? "stale"
          : last.state;
      const status = node("div", undefined, `project-status ${state}`);
      status.setAttribute("role", "status");
      status.append(
        node(
          "strong",
          state === "fresh"
            ? "Current snapshot"
            : state === "stale"
              ? "Stale — showing last known data"
              : "Project metadata unavailable",
        ),
      );
      if (state !== "fresh")
        status.append(
          node(
            "p",
            snapshot
              ? "Updates are unavailable or overdue. Counts and status may have changed."
              : "No project status is available. Try refreshing.",
          ),
        );
      if (snapshot)
        status.append(
          node("p", `Snapshot: ${snapshot.observedAt}`),
          node(
            "p",
            snapshot.intakePaused
              ? "Intake paused globally"
              : "Intake enabled globally",
          ),
        );
      root.append(status);
      if (!snapshot) return;
      let projects = snapshot.projects;
      if (selected) {
        const back = button("← All projects", () => {
          selected = null;
          render();
          root.querySelector("h1").focus();
        });
        root.append(back);
        projects = projects.filter((p) => p.id === selected);
      }
      const grid = node("div", undefined, "project-grid");
      for (const p of projects) {
        const card = node("article", undefined, "project-card");
        card.append(node("h2", p.name), link(p.repositoryUrl, p.repositoryUrl));
        field(card, "Project ID", p.id);
        field(card, "Base branch", p.baseBranch);
        field(card, "Tracking", p.tracking);
        field(card, "Queued", p.queuedJobs);
        field(card, "Last poll", p.lastPollAt || "Never polled");
        field(card, "Poll status", p.pollState);
        job(card, "Active work", p.activeJob);
        job(card, "Latest outcome", p.latestOutcome);
        field(card, "Blocker", p.blocker || "None recorded");
        if (!selected)
          card.append(
            button(
              "View project",
              () => {
                selected = p.id;
                render();
                root.querySelector("h2").focus();
              },
              p.id,
            ),
          );
        grid.append(card);
      }
      root.append(grid);
      if (!projects.length)
        root.append(
          node(
            "p",
            selected
              ? "Project is no longer in this snapshot."
              : "No projects registered.",
          ),
        );
      for (const heading of root.querySelectorAll("h1,h2"))
        heading.tabIndex = -1;
    } finally {
      if (focused) {
        const target = [...root.querySelectorAll("[data-focus-key]")].find(
          (n) => n.dataset.focusKey === focused,
        );
        target?.focus({ preventScroll: true });
      }
    }
  }
  async function refreshData() {
    if (!active || pending) return;
    const epoch = generation;
    pending = true;
    render(true);
    try {
      const result = await read();
      if (epoch !== generation || !active) return;
      last = result;
    } catch {
      if (epoch !== generation || !active) return;
      last = {
        state: last?.snapshot ? "stale" : "unavailable",
        snapshot: last?.snapshot || null,
        error: "Project metadata unavailable",
      };
    } finally {
      if (epoch === generation) {
        pending = false;
        if (active) render();
      }
    }
  }
  return {
    async show() {
      active = true;
      root.hidden = false;
      if (!timer && intervalMs > 0)
        timer = setInterval(() => refreshData(), intervalMs);
      await refreshData();
    },
    hide() {
      active = false;
      generation++;
      pending = false;
      clearInterval(timer);
      timer = null;
      root.hidden = true;
    },
    reset() {
      this.hide();
      last = null;
      selected = null;
      root.replaceChildren();
    },
    refresh: refreshData,
  };
}
