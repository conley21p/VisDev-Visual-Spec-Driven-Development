import * as vscode from 'vscode';
import * as path from 'path';
import { SubAgent } from './SubAgent';
import { VISDEV_ARCHITECTURAL_STANDARD_PROMPT } from '../sddStandards';

const SUB_AGENT_TOOLS = [
    {
        type: "function",
        function: {
            name: "update_spec_info",
            description: "Updates a field in the 'info' section of a specification (title, description, version, x-visdev-layer, etc.).",
            parameters: {
                type: "object",
                properties: {
                    nodeId: { type: "string", description: "Path to the YAML file" },
                    field: { type: "string", description: "The info field to update (e.g., 'version', 'description')" },
                    value: { type: "any" }
                },
                required: ["nodeId", "field", "value"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_spec_schema",
            description: "Adds or updates a schema in the components/schemas section.",
            parameters: {
                type: "object",
                properties: {
                    nodeId: { type: "string" },
                    name: { type: "string", description: "The name of the schema (e.g., 'Cart')" },
                    schema: { type: "object", description: "The schema definition object" }
                },
                required: ["nodeId", "name", "schema"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_spec_endpoint",
            description: "Adds or updates an endpoint in the paths section.",
            parameters: {
                type: "object",
                properties: {
                    nodeId: { type: "string" },
                    path: { type: "string", description: "The URL path (e.g., '/cart/items')" },
                    method: { type: "string", enum: ["get", "post", "put", "delete", "patch"] },
                    spec: { type: "object", description: "The endpoint specification (summary, responses, etc.)" }
                },
                required: ["nodeId", "path", "method", "spec"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "connect_nodes",
            description: "Creates a relational link between two schema properties across different spec files using x-link-target.",
            parameters: {
                type: "object",
                properties: {
                    sourceNodeId: { type: "string" },
                    sourceFieldPath: { type: "string" },
                    targetNodeId: { type: "string" },
                    targetFieldPath: { type: "string" }
                },
                required: ["sourceNodeId", "sourceFieldPath", "targetNodeId", "targetFieldPath"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_spec_content",
            description: "Reads the raw YAML content of a specific specification file.",
            parameters: {
                type: "object",
                properties: {
                    nodeId: { type: "string", description: "Path to the YAML file. Note: domain-layer specs are stored in 'specs/domain/'." }
                },
                required: ["nodeId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_blueprint_architecture",
            description: "Reads the entire global VisDev node blueprint and all relational links.",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "create_specification",
            description: "Creates a new YAML specification file within the appropriate layer directory.",
            parameters: {
                type: "object",
                properties: {
                    filename: { type: "string", description: "The name of the file, e.g. 'order-processor.yaml'. If .yaml is missing, it will be added automatically." },
                    'visdev-layer': { 
                        type: "string", 
                        enum: ["domain", "ui", "external", "data", "infra", "worker"],
                        description: "The architectural layer determining the storage directory."
                    },
                    title: { type: "string", description: "Human-readable title for the specification" }
                },
                required: ["filename", "visdev-layer", "title"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "delete_specification",
            description: "Permanently deletes a specification file from the project.",
            parameters: {
                type: "object",
                properties: {
                    nodeId: { type: "string", description: "Path to the YAML file to delete" }
                },
                required: ["nodeId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "delete_spec_field",
            description: "Deletes a specific field or object from a YAML specification using dotted path notation.",
            parameters: {
                type: "object",
                properties: {
                    nodeId: { type: "string" },
                    path: { type: "string", description: "Dotted path to the field to remove" }
                },
                required: ["nodeId", "path"]
            }
        }
    }
];

export class BlueprintSubAgent extends SubAgent {
    protected getSystemPrompt(): string {
        return `You are a VisDev Blueprint Specialist. Your task is to execute a technical deep-dive on a specific architectural component.
        
GOAL: Generate and inject high-fidelity YAML snippets into the master domain files. Ensure all OpenAPI constraints and patterns are followed.

You have full read/write access to the blueprint and individual specification files. Use 'read_spec_content' to understand existing structures before making updates.

---
${VISDEV_ARCHITECTURAL_STANDARD_PROMPT}`;
    }

    protected getTools(): any[] {
        return SUB_AGENT_TOOLS;
    }

    protected async executeToolCall(toolCall: any, webviewView: vscode.WebviewView): Promise<string> {
        const name = toolCall.function.name;
        const args = this.normalizeArguments(name, JSON.parse(toolCall.function.arguments));

        switch (name) {
            case 'update_spec_info': {
                await this.visdevManager.updateBlueprint({
                    type: 'UPDATE_INFO',
                    payload: { nodeId: args.nodeId, field: args.field, value: args.value }
                });
                return `SUCCESS: Updated info.${args.field} in ${args.nodeId}`;
            }

            case 'update_spec_schema': {
                await this.visdevManager.updateBlueprint({
                    type: 'UPDATE_SCHEMA',
                    payload: { nodeId: args.nodeId, name: args.name, schema: args.schema }
                });
                return `SUCCESS: Updated schema ${args.name} in ${args.nodeId}`;
            }

            case 'update_spec_endpoint': {
                await this.visdevManager.updateBlueprint({
                    type: 'UPDATE_ENDPOINT',
                    payload: { nodeId: args.nodeId, path: args.path, method: args.method, spec: args.spec }
                });
                return `SUCCESS: Updated endpoint ${args.method.toUpperCase()} ${args.path} in ${args.nodeId}`;
            }

            case 'connect_nodes': {
                await this.visdevManager.updateBlueprint({
                    type: 'CREATE_RELATION',
                    payload: {
                        sourceNodeId: args.sourceNodeId,
                        sourceFieldPath: args.sourceFieldPath,
                        targetNodeId: args.targetNodeId,
                        targetFieldPath: args.targetFieldPath
                    }
                });
                return `SUCCESS: Created relational link between ${args.sourceNodeId} and ${args.targetNodeId}`;
            }

            case 'read_spec_content':
                return await this.visdevManager.readWorkspaceFile(args.nodeId);

            case 'read_blueprint_architecture':
                return JSON.stringify(await this.visdevManager.getBlueprint());

            case 'create_specification': {
                let filename = args.filename;
                if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) {
                    filename += '.yaml';
                }
                const layer = args['visdev-layer'];
                const nodeId = `specs/${layer}/${filename}`;

                await this.visdevManager.updateBlueprint({
                    type: 'CREATE_SPEC',
                    payload: {
                        nodeId,
                        layer,
                        title: args.title
                    }
                });
                return `SUCCESS: Created specification at ${nodeId}`;
            }

            case 'delete_specification': {
                await this.visdevManager.updateBlueprint({
                    type: 'DELETE_SPEC',
                    payload: { nodeId: args.nodeId }
                });
                return `SUCCESS: Deleted ${args.nodeId}`;
            }

            case 'delete_spec_field': {
                await this.visdevManager.updateBlueprint({
                    type: 'DELETE_FIELD',
                    payload: {
                        nodeId: args.nodeId,
                        path: args.path
                    }
                });
                return `SUCCESS: Deleted field ${args.path} from ${args.nodeId}`;
            }

            default:
                return `ERROR: Tool ${name} not supported for Sub-Agent.`;
        }
    }
}
