// SpecInterface — structured, machine-readable contract definitions per node type

export type EndpointMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** ALL Supported Architectural Types */
export type VisdevNodeType = 
    | 'api' 
    | 'uiComponent' 
    | 'dbModel' 
    | 'event' 
    | 'worker' 
    | 'logic' 
    | 'gateway' 
    | 'cache' 
    | 'externalService' 
    | 'note' 
    | 'boundary';

export interface APIEndpoint {
    method: EndpointMethod;
    path: string;
    auth: boolean;
    description?: string;
    requestBody?: Record<string, string>;   // fieldName → "string | number | boolean | required"
    responseBody?: Record<string, string>;
}

export interface SpecInterfaceAPI {
    type: 'api';
    endpoints: APIEndpoint[];
}

export interface DBField {
    name: string;
    dataType: 'string' | 'number' | 'boolean' | 'timestamp' | 'uuid' | 'json';
    required: boolean;
    unique: boolean;
    description?: string;
}

export interface SpecInterfaceDBModel {
    type: 'dbModel';
    tableName: string;
    fields: DBField[];
}

export interface SpecInterfaceEvent {
    type: 'event';
    eventName: string;
    source: string;
    consumers: string[];
    payload: Record<string, string>;   // fieldName → type hint
}

export interface UIComponentProp {
    name: string;
    propType: string;
    required: boolean;
}

export interface SpecInterfaceUI {
    type: 'uiComponent';
    componentName: string;
    props: UIComponentProp[];
    emits: string[];
    consumesAPIs: string[];
}

/** New Types for Phase 20 */

export interface SpecInterfaceWorker {
    type: 'worker';
    jobName: string;
    schedule?: string; // cron expression
    queueSource?: string;
}

export interface SpecInterfaceLogic {
    type: 'logic';
    moduleName: string;
    publicMethods: string[];
}

export interface SpecInterfaceGateway {
    type: 'gateway';
    gatewayType: 'proxy' | 'loadBalancer' | 'auth';
    routes: string[];
}

export interface SpecInterfaceCache {
    type: 'cache';
    engine: 'redis' | 'memcached' | 'local';
    ttl: number; // in seconds
}

export interface SpecInterfaceExternal {
    type: 'externalService';
    serviceName: string; // e.g. "Stripe", "AWS S3"
    providerDocUrl?: string;
}

/** Organizational Types (Note: these often have empty structured data or just text) */
export interface SpecInterfaceNote {
    type: 'note';
    contentSnippet: string;
}

export interface SpecInterfaceBoundary {
    type: 'boundary';
    groupName: string;
}

export type SpecInterface =
    | SpecInterfaceAPI
    | SpecInterfaceDBModel
    | SpecInterfaceEvent
    | SpecInterfaceUI
    | SpecInterfaceWorker
    | SpecInterfaceLogic
    | SpecInterfaceGateway
    | SpecInterfaceCache
    | SpecInterfaceExternal
    | SpecInterfaceNote
    | SpecInterfaceBoundary;

/** Dual representation of a Spec Interface — Human Markdown and Machine JSON */
export interface DualSpecInterface {
    raw: string;
    structured: SpecInterface[]; 
}

/** 
 * Safely parse spec_interface from file storage.
 * Handles the composite { raw: string, structured: Array } format.
 */
export function parseSpecInterface(data: any): DualSpecInterface {
    if (!data) return { raw: '', structured: [] };

    if (typeof data === 'object' && 'raw' in data && 'structured' in data) {
        return {
            raw: data.raw || '',
            structured: Array.isArray(data.structured) ? data.structured : []
        };
    }

    if (typeof data === 'string') {
        return { raw: data, structured: [] };
    }

    return { raw: '', structured: [] };
}

/** Human readable summary rows for display in the Blueprint node card */
export function getInterfaceSummary(data: any): string[] {
    const dual = parseSpecInterface(data);
    if (dual.structured.length === 0) return [];
    return dual.structured.flatMap(iface => doGetSummary(iface));
}

function doGetSummary(iface: SpecInterface): string[] {
    switch (iface.type) {
        case 'api':
            return iface.endpoints.slice(0, 3).map(e => `${e.method} ${e.path}`);
        case 'dbModel':
            return iface.fields.slice(0, 3).map(f => `${f.name}: ${f.dataType}${f.required ? '' : '?'}`);
        case 'event':
            return [`⚡ ${iface.eventName}`];
        case 'uiComponent':
            return [`<${iface.componentName}>` ];
        case 'worker':
            return [`⚙️ ${iface.jobName}`, iface.schedule ? `🕒 ${iface.schedule}` : ''].filter(Boolean);
        case 'cache':
            return [`💾 ${iface.engine.toUpperCase()}`, `⏱️ TTL: ${iface.ttl}s`];
        case 'externalService':
            return [`🌐 ${iface.serviceName}`];
        case 'gateway':
            return [`🚪 ${iface.gatewayType.toUpperCase()}`];
        case 'logic':
            return [`🧠 ${iface.moduleName}`];
        case 'note':
            return [iface.contentSnippet.slice(0, 50)];
        case 'boundary':
            return [`📦 ${iface.groupName}`];
        default:
            return [];
    }
}
