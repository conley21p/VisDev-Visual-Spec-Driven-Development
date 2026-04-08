export const AgentToolsSchema = [
    {
        type: "function",
        function: {
            name: "create_specification_node",
            description: "Creates a new specification node. You MUST provide both a human-readable Markdown 'spec_interface_raw' and a machine-readable JSON 'spec_interface_structured' that correlate perfectly.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "string", description: "A unique, lowercase identifier for the node (e.g. 'auth-service')" },
                    label: { type: "string", description: "Human readable label for the UI graph" },
                    type: { type: "string", enum: ["api", "uiComponent", "dbModel", "event", "worker", "logic", "gateway", "cache", "externalService", "note", "boundary"], description: "Architectural type. See reference manual." },
                    spec_interface_raw: {
                        type: "string",
                        description: "Formal documentation of the interface in Markdown. Use headers, lists, and code blocks."
                    },
                    spec_interface_structured: {
                        type: "array",
                        items: {
                            type: "object",
                            description: "A structured architectural contract (api, dbModel, event, or uiComponent)."
                        },
                        description: "An array of structured architectural contracts. Each contract must follow the schema: api→{type:'api',endpoints:[...]}, dbModel→{type:'dbModel',tableName,fields:[...]}, event→{type:'event',eventName,source,payload}, uiComponent→{type:'uiComponent',componentName,props,emits,consumesAPIs}"
                    },
                    spec_constraints: { type: "string", description: "Markdown defining the 'Rules of the Game' (Data formats, Business rules, Security/Auth invariants)." },
                    spec_interactions: { type: "string", description: "Markdown defining the 'Sequence' (Execution flow, Side effects, Retry logic, Dependency calls)." },
                    spec_metadata: { type: "string", description: "Markdown defining the 'Context' (Functional purpose, Technical debt, Ownership, #ClassificationTags)." },
                },
                required: ["id", "label", "type", "spec_interface_raw", "spec_interface_structured", "spec_constraints", "spec_interactions", "spec_metadata"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_specification_node",
            description: "Edits an existing specification node's documentation.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    type: { type: "string", enum: ["api", "uiComponent", "dbModel", "event", "worker", "logic", "gateway", "cache", "externalService", "note", "boundary"] },
                    spec_interface_raw: { type: "string", description: "Optional updated interface markdown" },
                    spec_interface_structured: { 
                        type: "array", 
                        items: { type: "object" },
                        description: "Optional updated array of structured interface objects" 
                    },
                    spec_constraints: { type: "string", description: "Optional updated constraints markdown" },
                    spec_interactions: { type: "string", description: "Optional updated interactions markdown" },
                    spec_metadata: { type: "string", description: "Optional updated metadata markdown" },
                },
                required: ["id"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "write_code",
            description: "Creates or modifies an implementation code file on the user's local disk.",
            parameters: {
                type: "object",
                properties: {
                    file_path: { type: "string", description: "Path to file to write relative to workspace root" },
                    content: { type: "string", description: "Code content to write" },
                },
                required: ["file_path", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "resolve_active_drift",
            description: "Resolves active architectural drift. Analyzes drifted files and reconciles the Specs. MANDATORY if active drift exists.",
            parameters: {
                type: "object",
                properties: {
                    reconciliation_plan: { type: "string", description: "The plan to fix the drift." },
                },
                required: ["reconciliation_plan"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "connect_nodes",
            description: "Creates a directed relationship (edge) between two existing specification nodes.",
            parameters: {
                type: "object",
                properties: {
                    source_id: { type: "string" },
                    target_id: { type: "string" },
                    label: { type: "string", description: "Optional verb describing the relationship (e.g. 'calls', 'publishes to')" },
                },
                required: ["source_id", "target_id"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "remove_connection",
            description: "Deletes an existing relationship/edge from the blueprint.",
            parameters: {
                type: "object",
                properties: {
                    edge_id: { type: "string", description: "The ID of the edge (found via read_blueprint_architecture)" }
                },
                required: ["edge_id"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "register_file_to_node",
            description: "Associates an existing file in the workspace with a specific architectural spec node. Use this to maintain the bi-directional link between code and architecture.",
            parameters: {
                type: "object",
                properties: {
                    node_id: { type: "string", description: "The ID of the spec node (e.g. 'auth-db')" },
                    relative_path: { type: "string", description: "Path from project root (e.g. 'src/infra/db.ts')" }
                },
                required: ["node_id", "relative_path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "generate_architecture",
            description: "Takes a high-level command and expands it into a fully mapped multi-node architecture graph recursively. Generates both nodes and edges en masse.",
            parameters: {
                type: "object",
                properties: {
                    nodes: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string" },
                                label: { type: "string" },
                                type: { type: "string", enum: ["api", "uiComponent", "dbModel", "event", "worker", "logic", "gateway", "cache", "externalService", "note", "boundary"] },
                                spec_interface_raw: { type: "string" },
                                spec_interface_structured: { 
                                    type: "array", 
                                    items: { type: "object" }
                                },
                                spec_constraints: { type: "string" },
                                spec_interactions: { type: "string" },
                                spec_metadata: { type: "string" }
                            },
                            required: ["id", "label", "type", "spec_interface_raw", "spec_interface_structured", "spec_constraints", "spec_interactions", "spec_metadata"]
                        }
                    },
                    edges: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                source: { type: "string" },
                                target: { type: "string" },
                                label: { type: "string" }
                            },
                            required: ["source", "target"]
                        }
                    }
                },
                required: ["nodes"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_visdev_demo_project",
            description: "Automatically bootstraps the workspace with a pre-configured 3-Node Demonstration Architecture. ONLY USE THIS if the user explicitly asks to try a demo or bootstrap a test environment.",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_blueprint_architecture",
            description: "Reads the entire global VisDev node blueprint. Use this tool voluntarily when you need to understand the macro architecture to avoid duplicating nodes.",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_workspace_files",
            description: "Lists all source code files in the workspace (excluding node_modules, .git, .visdev, dist). Use this to understand the overall file tree before reading or generating code.",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "list_node_files",
            description: "Returns the list of source code files that are registered as associated to a specific spec node. Use this to understand what code already exists for a given spec.",
            parameters: {
                type: "object",
                properties: {
                    node_id: { type: "string", description: "The ID of the spec node to list associated files for." }
                },
                required: ["node_id"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Reads the raw content of a workspace file by relative path. Files over 50KB will be rejected. Use this to review existing code before modifying or generating related code.",
            parameters: {
                type: "object",
                properties: {
                    relative_path: { type: "string", description: "The relative file path from workspace root, e.g. 'src/auth/login.ts'" }
                },
                required: ["relative_path"]
            }
        }
    }
];

export function getToolsForMode(mode: string, hasDrift: boolean = false, isInitialized: boolean = true) {
    if (!isInitialized) {
        // If uninitialized, restrict tool access rigidly to Demo Project initialization schema!
        return AgentToolsSchema.filter(t => t.function.name === 'create_visdev_demo_project');
    }

    if (hasDrift) {
        // Drift Lock Constraint: Only allow resolving drift.
        return AgentToolsSchema.filter(t => t.function.name === 'resolve_active_drift');
    }

    if (mode === 'add-spec') {
        // Strip code writing capabilities
        return AgentToolsSchema.filter(t => t.function.name === 'create_specification_node' || t.function.name === 'read_blueprint_architecture');
    }
    if (mode === 'update-spec') {
        return AgentToolsSchema.filter(t => t.function.name === 'update_specification_node' || t.function.name === 'read_blueprint_architecture');
    }
    // all-powerful returns all tools (except drift resolution and demo creation)
    return AgentToolsSchema.filter(t => t.function.name !== 'resolve_active_drift' && t.function.name !== 'create_visdev_demo_project');
}
