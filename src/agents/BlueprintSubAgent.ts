import * as vscode from 'vscode';
import * as path from 'path';
import { SubAgent } from './SubAgent';

const SUB_AGENT_TOOLS = [
    {
        type: "function",
        function: {
            name: "update_spec_field",
            description: "Updates a specific field in a YAML specification using dotted path notation.",
            parameters: {
                type: "object",
                properties: {
                    nodeId: { type: "string", description: "The relative path to the YAML file, e.g. 'specs/domains/items.yaml'" },
                    path: { type: "string", description: "Dotted path, e.g. 'components.schemas.User.properties.email.type'" },
                    value: { type: "any" }
                },
                required: ["nodeId", "path", "value"]
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
                    nodeId: { type: "string" }
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
    }
];

export class BlueprintSubAgent extends SubAgent {
    protected getSystemPrompt(): string {
        return `You are a VisDev Blueprint Specialist. Your task is to execute a technical deep-dive on a specific architectural component.
        
GOAL: Generate and inject high-fidelity YAML snippets into the master domain files. Ensure all OpenAPI constraints and patterns are followed.

You have full read/write access to the blueprint and individual specification files. Use 'read_spec_content' to understand existing structures before making updates.`;
    }

    protected getTools(): any[] {
        return SUB_AGENT_TOOLS;
    }

    protected async executeToolCall(toolCall: any, webviewView: vscode.WebviewView): Promise<string> {
        const name = toolCall.function.name;
        const args = this.normalizeArguments(name, JSON.parse(toolCall.function.arguments));

        switch (name) {
            case 'update_spec_field': {
                await this.visdevManager.updateBlueprint({
                    type: 'UPDATE_FIELD',
                    payload: {
                        nodeId: args.nodeId,
                        path: args.path,
                        value: args.value
                    }
                });
                return `SUCCESS: Updated ${args.path} in ${args.nodeId}`;
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

            default:
                return `ERROR: Tool ${name} not supported for Sub-Agent.`;
        }
    }
}
