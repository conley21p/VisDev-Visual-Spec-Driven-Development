export const AgentToolsSchema = [
    {
        type: "function",
        function: {
            name: "create_specification_node",
            description: "Creates a new specification node in the architecture map and generates its underlying Markdown documentation.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "string", description: "A unique, lowercase identifier for the node (e.g. 'auth-service')" },
                    label: { type: "string", description: "Human readable label for the UI graph" },
                    type: { type: "string", description: "Type of node: 'feature' or 'dbModel'" },
                    markdown_content: { type: "string", description: "Detailed Markdown specs containing acceptance criteria and implementation details." },
                },
                required: ["id", "label", "type", "markdown_content"]
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
                    markdown_content: { type: "string" },
                },
                required: ["id", "markdown_content"]
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
    }
];

export function getToolsForMode(mode: string) {
    if (mode === 'add-spec') {
        // Strip code writing capabilities
        return AgentToolsSchema.filter(t => t.function.name === 'create_specification_node');
    }
    if (mode === 'update-spec') {
        return AgentToolsSchema.filter(t => t.function.name === 'update_specification_node');
    }
    // all-powerful returns all tools
    return AgentToolsSchema;
}
