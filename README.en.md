<div align="center">

# Relay

Connected Git/npm projects now have a general development workflow: describe a feature, let the built-in operator read/edit real source, install dependencies in an independent environment, run reviewed scripts, inspect the live application, package actual outputs and restore a development checkpoint. Supported desktop packages bundle Node/npm; Git remains required, and building Relay also needs Python. Fixed free lessons are separate. Real provider acceptance has not been run in this release. [Development guide](docs/SELF_DEVELOPMENT.md).

### A visual office workspace for vibe coders.

Organize work in natural language and build it by hand. Bring documents, multi-model teams, a maintained GitHub resource library, and authorization handoffs into one visible, interruptible workflow.

[简体中文](README.md) · [Product](docs/PRODUCT.md) · [Quick start](docs/QUICKSTART.md) · [Integrations](docs/INTEGRATIONS.md) · [Demo](docs/DEMO.md)

![Alpha](https://img.shields.io/badge/status-alpha-6C63FF)
[![CI](https://github.com/shian493719730-art/relay-agent-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/shian493719730-art/relay-agent-studio/actions/workflows/ci.yml)
[![AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

![Relay canvas with projects, agents and connections](docs/media/workspace.png)

</div>

**Alpha software.** Run it locally as a single-user desktop app or from source. The tutorial needs no API key. Real inference requires your own provider configuration and may incur charges. The current UI is primarily Simplified Chinese; English localization is on the roadmap.

## Build your everyday work visually

For people who work with AI through natural language and want to shape their own tools: organize briefs, analyze files, plan content, review deliverables, and connect the next project. Draw a project, drop in files, assign agents their own models, and connect the results to another project. A coordinator plans the work, members execute dependencies, and a final pass produces artifacts. Downstream agents can read explicitly shared context and continue.

- **Build by hand:** freehand regions, optional circles and other shapes, resizable projects and panels, groups, notes, linked document readers, editable layouts and styles.
- **Choose per agent:** separate connection, exact model ID, and role. Configurable Responses, Chat Completions, and Anthropic Messages endpoints; custom relays are optional.
- **Stay in control:** pause, interrupt, change requirements, remove objects, undo and redo. Restoring objects never automatically restarts paid inference.
- **Follow the handoff:** shared content and triggers live on connections, with source receipts and project/group progress.
- **Use your files:** DOCX, XLSX, text-based PDF and plain text extraction. No scanned-PDF OCR promise.
- **Ask the built-in operator:** it uses software actions and observes results. Playwright MCP provides visible clicks, typing and dragging in a dedicated browser limited to Relay itself.
- **Develop real source:** connect an explicit Git repository, read and edit files, inspect Git diffs, revert individual edits, run approved project checks and stop their processes. The built-in operator uses the same bridge, including for Relay's own source. [Source development](docs/SELF_DEVELOPMENT.md).
- **Explore safely:** a 19-step local media-workflow tutorial plus an integration tour, with numbered arrows. Scripted samples are clearly distinguished from real model execution.

## A maintained supply of GitHub resources

The built-in library indexes **5,000+ Skills, workflows, agent methods and tool source pointers** across development and office tasks. Choose a project to get recommendations based on its goal, roles and file types; inspect the original repository, terms, body and review status, then save useful references or use relevant Skills for prompt refinement.

The updater checks maintained upstream repositories and directory changes, tracks new, changed, removed or archived entries, and keeps a valid catalog when a source fails. Changed content does not inherit an old review label. The desktop app includes weekly checks while it is running, with pause controls, manual refresh and visible status. Source installs can explicitly enable the local scheduler or use a host task; there is no hosted background service. An indexed resource is not automatically installed or runtime-validated. [Integration details](docs/INTEGRATIONS.md).

## Authorization handoffs inside the workspace

Relay includes the **Auth Relay UI and task bridge**: inspect existing scope and expiry, request a scoped task, focus a verification checkpoint, resume the same handoff, or cancel a task created by Relay. You can take over when a step needs your input and return to the workflow.

The broker is the separately installed, previously authorized **macOS Auth Relay application**, which is not bundled with Relay. Missing or paused authorization is shown explicitly; the adapter does not grant broader permissions or turn a tutorial action into real authorization.

![Actual UI walkthrough, edited from captured steps](docs/media/walkthrough.gif)

This recording demonstrates local UI and tutorial behavior, not a paid autonomous-model benchmark. [MP4 and disclosure](docs/DEMO.md).

## Download the desktop app

Choose a matching build from [Releases](https://github.com/shian493719730-art/relay-agent-studio/releases). Desktop packages include their runtime; end users do not need Node, Python or Codex. App updates preserve a separate user-data directory. See [installation and backups](docs/DESKTOP.md) and [license/brand terms](docs/LICENSING.md). Community builds are not notarized or commercially signed; review each release’s platform validation.

**Current maintenance and release acceptance cover macOS and Linux. Windows configuration and historical binaries are experimental references: Windows compatibility, tests and packaging are not required and do not block releases.** macOS has hands-on UI verification; full Linux desktop interaction still needs real-machine validation. See [platform scope and evidence](docs/PLATFORMS.md).

Source development additionally needs local Git and Node/npm; building Relay also needs Python. Users choose the repository and script permissions. The operator cannot grant itself another directory. Running repository code is not an operating-system sandbox.

## Run from source

Install **Node.js 24+, npm, and Python 3** (`python3` on PATH).

```bash
git clone https://github.com/shian493719730-art/relay-agent-studio.git
cd relay-agent-studio
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4317/design-v2/**. Start with the tutorial at the lower right. For real work, open Connections, add your endpoint/protocol/exact model ID/key, test it, bind agents, then explicitly start a task. Connection tests can incur provider charges.

## Included and optional integrations

| Integration | Availability |
| --- | --- |
| Model connection layer | Included. Provider access and protocol compatibility determine usable models; brand icons do not certify model identity. |
| Custom API relay | Optional. No mandatory relay vendor. A relay may differ in quality, availability and data handling; its advertised model cannot be independently guaranteed. |
| Playwright MCP | Included npm dependency. Relay-origin browser control, pause and takeover. Not unrestricted desktop automation. |
| Skill / workflow library | 5,000+ source pointers and metadata, on-demand body reading, local search and recommendations. Listing, reading and runtime validation are distinct. Desktop weekly checks run while the app is open; the source scheduler is opt-in. |
| Prompt optimization | Included intent-driven Skill selection with three original starter guides and custom local directories. Live refinement uses your model. [Snapper Assist](https://github.com/shian493719730-art/snapper-assist) is an optional separate app. |
| Auth Relay | Optional macOS adapter to an existing, separately installed and authorized app. That app is not distributed here. |

## Contribute

```bash
npm run typecheck
npm test
npm run build
npm run check:public
```

The suite contains **196 offline tests**, including actual source edits, conflicts, rollback and real check-process termination. Per-commit results are recorded in [CI](https://github.com/shian493719730-art/relay-agent-studio/actions/workflows/ci.yml) and [packaged-backend verification](https://github.com/shian493719730-art/relay-agent-studio/actions/workflows/desktop.yml). Default CI and packaging require only macOS and Linux; Windows does not gate publication. Providers are mocked; native UI and paid-provider acceptance remain separate. [Platform scope](docs/PLATFORMS.md) records historical failures and fixes. See [Contributing](CONTRIBUTING.md), [Architecture](docs/ARCHITECTURE.md), [Roadmap](docs/ROADMAP.md) and [Security](SECURITY.md). Detailed guides currently include Chinese text; translations are welcome.

Local single-user only: desktop distribution and source installs are available; no hosted service or multi-user access control yet. Keys are local server-side files, not an encrypted vault. Selected task/file content is sent to configured providers. See [Privacy](docs/PRIVACY.md).

AGPL-3.0-only for this version’s original project code and guides; historical MIT releases retain their grants. External Skills, dependencies and trademarks retain their own terms. [Third-party notices](THIRD_PARTY_NOTICES.md).

### Source development for everyone

Open **Tutorial → Source self-development** for an eight-step, offline lesson with real files, edits, test exit codes, diffs and rollback. The desktop lesson uses its bundled Node runtime, with no Git/npm installation, API key or dependency downloads. A deliberately unmet welcome-text assertion passes after your edit and fails again after rollback; the lesson verifies both outcomes. Then connect your own Git repository and explicitly review its check scripts. [Source development guide](docs/SELF_DEVELOPMENT.md).

The **Natural-language Relay development** lesson uses the built-in software operator to read the actual assistant-copy source in an isolated copy, apply a version-checked edit, run a real test, preview the same UI component, and roll back. Local mode is explicitly a bounded scripted lesson without model inference. Preparing a real AI task connects your own repository and model without automatically starting inference.
