# VisDev - Visual Spec Driven Development

## Product Description

VisDev is an AI-powered VS Code extension that enables true **Visual Spec-Driven Development** (SDD). 

VisDev provides a dynamic, interactive Blueprint graph directly inside your editor. Instead of getting bogged down in dense Markdown specification files, you visually define features, API endpoints, and data models. An autonomous AI agent then acts on this visual topology to write your implementation code. To ensure architectural integrity, VisDev actively monitors your file system to detect manual code overrides, immediately alerting you and offering AI-assisted pathways to reconcile code drift with your visual spec map.

## Product Founding Description

**"A GUI is worth a thousand words."**

The software industry is currently undergoing a massive paradigm shift in AI-assisted coding. Currently, we see two dominant approaches:
1. **Unstructured Vibe Coding**: Tools like Replit cater to non-technical users, while IDEs like Cursor cater to technical developers. However, raw "vibe coding" often lacks the architectural rigor required for scalable, maintainable software.
2. **CLI-based Agentic Coding**: Tools like Claude Code CLI unlock vast development velocity, but human developers are inherently limited by the sheer volume of text they can read during the code review loop.

The industry is now adopting **Spec-Driven Development (SDD)** to solve the structure problem. Unfortunately, existing SDD tools are still trapped in the old IDE paradigm—forcing developers to manually search through file trees and read dense Markdown specification files. 

Historically, software development experienced a massive unlock in productivity when we transitioned from pure CLI environments to visually vibrant IDEs. A similar leap is happening now. 

This product aims to provide the **next step function in developer velocity**. By providing technical users with a visually vibrant, interactive GUI that maps out the specification, we keep the human securely in the decision-making and review loop without bottlenecking them with text. Developers can see their architecture, converse with the agent, and maintain high-velocity oversight.

## Technical Product Outline

VisDev is built as a **Rich VS Code Extension**, leveraging native editor APIs for performance while providing a custom React Webview for the interactive blueprint.

### Architecture Stack
- **Platform**: VS Code Extension API (TypeScript/Node.js) to leverage text editing, language servers, and terminal features natively.
- **Vibrant GUI**: A Custom Webview Panel within VS Code rendering a **React** application.
- **Visual Graph**: **React Flow** running inside the Webview to render the interactive Spec Graph and dynamic Spec Builder forms.
- **Agent Chat**: A native VS Code Sidebar View Container featuring specific AI constraint modes (e.g., "Add Spec", "Update Spec", "All Powerful").
- **Diff Tracking**: Native VS Code `vscode.workspace.createFileSystemWatcher` to detect manual user code modifications implicitly.

### Configuration & Context Management (`.visdev/`)
To keep the specification system highly robust, git-friendly, and easy for the LLM to parse, the underlying data architecture relies on a local `.visdev` directory injected into the root of the workspace:

- **`visdev.json`**: The core source of truth defining the project name, global constraints, tech stack tags, and file-to-node mapping bindings.
- **`.visdev/specs/[node_id].md`**: The actual rich Markdown specification for each visual node. (The visual graph topology coordinates are stored separately so they don't bloat the LLM context limits).
- **`visdev_sync.json`**: Tracks the drift state. When a file watcher flags an edited file, the system triggers a silent background LLM evaluation against the Markdown spec to determine if the edit constitutes "True Architecture Drift." If true, the specific React Flow node flashes yellow, prompting the developer to use a Sidebar Agent action to either officially assimilate the new code into the spec, or revert the code to stay within architectural compliance.
