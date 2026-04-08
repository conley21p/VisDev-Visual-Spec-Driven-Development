# Developing and Testing the VisDev Extension

Because this extension uses a hybrid architecture (a React Webview inside a native VS Code environment), running it manually requires bootstrapping two systems.

## Step 1: Build the React Webview
Anytime you make changes in the `webview-ui/src/` folder (like modifying `SpecBuilder.tsx` or `App.tsx`), you must rebuild the React bundle so the extension can serve the updated webpage.

Open a terminal at the root of the project and run:
```bash
npm run build:webview
```
*(Note: If you plan on actively editing React, you can also spin up the Vite dev-server locally first to test UI, but to test it **inside** VS Code, it must be compiled).*

## Step 2: Compile the VS Code Extension (Backend)
The native VS Code extension API logic living in `/src` (e.g. `extension.ts`, `visdevManager.ts`, `agentTools.ts`) is written in TypeScript and must be transpiled.

Instead of building it once, you should run the Webpack `watch` script. This will actively monitor your `/src` files and continuously compile them in the background.

Open a second terminal window at the root and leave this running:
```bash
npm run watch
```

## Step 3: Launch the Extension Development Host
With your React bundle built and your `watch` script running, open your root project natively in VS Code and press **`F5`** on your keyboard. 

*(Alternatively, go to the Run tab in the top menu and click `Start Debugging`)*.

This command opens a brand-new, completely separate VS Code window titled **[Extension Development Host]**. This is your testing sandbox.

## Step 4: Interact with VisDev
Inside your new testing sandbox context:
1. Open an actual folder/workspace (do not use an empty VS code window without a folder). VisDev needs an active file system path to initialize the `.visdev/` folder.
2. The extension is configured to auto-activate when VS Code finishes loading (`onStartupFinished`). 
3. Unless you already stored one in the Secure Storage, VS Code should immediately prompt you for an NVidia Kimi API Key.
4. If it doesn't open the Webview immediately, launch the command palette (**`Cmd + Shift + P`**) and type/select:
   > `VisDev: Open Blueprint`
5. To load the AI agent, click the new **VisDev Logo** in the far-left Activity Bar to reveal the Sidebar view.

## Step 5: Testing the "Demo Project" Quickstart
To explicitly test the autonomous **Demo Project Template**:
1. You MUST operate in a completely empty workspace. If you run VisDev in an actively developed repository, the LLM will lock the tool to respect existing files.
2. If you are recycling a test folder, delete the `/.visdev/` folder so VisDev thinks the environment is uninitialized.
3. Open the Blueprint visualizer, wait for the **Project Constraints Modal** to hover over the canvas, and click the **Generate 3-Node Demo Architecture (Quickstart)** secondary button.
4. Alternatively, command the AI agent directly and watch it cast the `create_visdev_demo_project` tool natively.

---

## 🔁 Workflow Cheat Sheet
*   **Edited React (`/webview-ui`)**: Close the testing window, run `npm run build:webview`, and press **`F5`**.
*   **Edited Extension (`/src`)**: Let `npm run watch` recompile automatically, then switch to your testing window and press **`Cmd + R`** (or `Ctrl + R`) to refresh the sandbox immediately!
