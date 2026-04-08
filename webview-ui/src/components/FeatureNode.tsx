import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const METHOD_COLORS: Record<string, string> = {
    GET: '#27ae60', POST: '#2980b9', PUT: '#f39c12',
    DELETE: '#c0392b', PATCH: '#8e44ad'
};

const TYPE_BORDER: Record<string, string> = {
    api: '#2980b9', 
    dbModel: '#8e44ad', 
    event: '#e67e22', 
    uiComponent: '#27ae60',
    worker: '#f1c40f',
    logic: '#16a085',
    gateway: '#34495e',
    cache: '#9b59b6',
    externalService: '#7f8c8d',
    note: '#f39c12',
    boundary: '#95a5a6'
};

const TYPE_BADGE: Record<string, string> = {
    api: 'API', 
    dbModel: 'DB', 
    event: 'EVT', 
    uiComponent: 'UI',
    worker: 'WRK',
    logic: 'LOGIC',
    gateway: 'GW',
    cache: 'MEM',
    externalService: 'EXT',
    note: 'NOTE',
    boundary: 'AREA'
};

function renderInterfaceSummary(iface: any): React.ReactNode {
    if (!iface) return null;
    const structuredList = iface.structured;
    if (!Array.isArray(structuredList) || structuredList.length === 0) {
        return <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic' }}>No structured interface</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {structuredList.map((structured, idx) => {
                const color = TYPE_BORDER[structured.type] || '#555';
                switch (structured.type) {
                    case 'api':
                        return (
                            <div key={idx} style={{ borderLeft: `2px solid ${color}`, paddingLeft: '6px' }}>
                                {(structured.endpoints || []).slice(0, 2).map((e: any, i: number) => (
                                    <div key={i} style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '3px' }}>
                                        <span style={{ fontSize: '8px', fontWeight: 'bold', padding: '1px 3px', borderRadius: '2px', background: METHOD_COLORS[e.method] || '#555', color: '#fff' }}>
                                            {e.method}
                                        </span>
                                        <span style={{ fontSize: '9px', color: '#bbb', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                                            {e.path}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        );
                    case 'dbModel':
                        return (
                            <div key={idx} style={{ borderLeft: `2px solid ${color}`, paddingLeft: '6px' }}>
                                {(structured.fields || []).slice(0, 3).map((f: any, i: number) => (
                                    <div key={i} style={{ display: 'flex', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
                                        <span style={{ fontSize: '9px', color: '#ccc', fontFamily: 'monospace' }}>{f.name}</span>
                                        <span style={{ fontSize: '8px', color: '#888' }}>:{f.dataType}{f.required ? '' : '?'}</span>
                                    </div>
                                ))}
                            </div>
                        );
                    case 'event':
                        return (
                            <div key={idx} style={{ borderLeft: `2px solid ${color}`, paddingLeft: '6px' }}>
                                <div style={{ fontSize: '9px', color: color }}>⚡ {structured.eventName}</div>
                            </div>
                        );
                    case 'uiComponent':
                        return (
                            <div key={idx} style={{ borderLeft: `2px solid ${color}`, paddingLeft: '6px' }}>
                                <div style={{ fontSize: '9px', color: color }}>&lt;{structured.componentName}&gt;</div>
                            </div>
                        );
                    case 'worker':
                        return (
                            <div key={idx} style={{ borderLeft: `2px solid ${color}`, paddingLeft: '6px' }}>
                                <div style={{ fontSize: '9px', color: color }}>⚙️ {structured.jobName}</div>
                                {structured.schedule && <div style={{ fontSize: '8px', color: '#888' }}>🕒 {structured.schedule}</div>}
                            </div>
                        );
                    case 'cache':
                        return (
                            <div key={idx} style={{ borderLeft: `2px solid ${color}`, paddingLeft: '6px' }}>
                                <div style={{ fontSize: '9px', color: color }}>💾 {structured.engine?.toUpperCase()}</div>
                                <div style={{ fontSize: '8px', color: '#888' }}>TTL: {structured.ttl}s</div>
                            </div>
                        );
                    case 'externalService':
                        return (
                            <div key={idx} style={{ borderLeft: `2px solid ${color}`, paddingLeft: '6px' }}>
                                <div style={{ fontSize: '9px', color: color }}>🌐 {structured.serviceName}</div>
                            </div>
                        );
                    case 'logic':
                        return (
                            <div key={idx} style={{ borderLeft: `2px solid ${color}`, paddingLeft: '6px' }}>
                                <div style={{ fontSize: '9px', color: color }}>🧠 {structured.moduleName}</div>
                            </div>
                        );
                    case 'gateway':
                        return (
                            <div key={idx} style={{ borderLeft: `2px solid ${color}`, paddingLeft: '6px' }}>
                                <div style={{ fontSize: '9px', color: color }}>🚪 {structured.gatewayType?.toUpperCase()}</div>
                            </div>
                        );
                    case 'note':
                        return (
                            <div key={idx} style={{ fontSize: '10px', color: '#ccc', fontStyle: 'italic', padding: '4px', background: 'rgba(243, 156, 18, 0.1)', borderRadius: '4px' }}>
                                {structured.contentSnippet}
                            </div>
                        );
                    case 'boundary':
                        return (
                            <div key={idx} style={{ fontSize: '10px', fontWeight: 'bold', color: '#95a5a6', textAlign: 'center', border: '1px dashed #95a5a6', borderRadius: '4px', padding: '8px 4px' }}>
                                --- {structured.groupName} ---
                            </div>
                        );
                    default: return null;
                }
            })}
        </div>
    );
}

export default function FeatureNode({ data, selected, type }: NodeProps) {
    const [isEditing, setIsEditing] = React.useState(false);
    const [tempLabel, setTempLabel] = React.useState(data.label);

    const iface = data.interfaceData;
    const nodeType = type || 'api';
    
    // Boundary nodes use a very different base style
    const isBoundary = nodeType === 'boundary';
    const isNote = nodeType === 'note';

    const borderColor = selected ? '#007acc' : (data.isExecuted ? '#4caf50' : (TYPE_BORDER[nodeType] || '#555'));
    const isLocked = !!data.isExecuting || !!data.isExecuted;

    const handleSave = () => {
        setIsEditing(false);
        if (tempLabel && tempLabel !== data.label) {
            data.onRename(data.id, tempLabel);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') {
            setTempLabel(data.label);
            setIsEditing(false);
        }
    };

    return (
        <div style={{
            padding: isBoundary ? '15px' : '10px',
            borderRadius: '10px',
            background: isBoundary ? 'transparent' : (isNote ? '#4d3d2d' : (selected ? '#333' : '#252525')),
            color: '#fff',
            border: isBoundary ? `2px dashed ${borderColor}` : `2px solid ${borderColor}`,
            minWidth: isBoundary ? '200px' : '175px',
            maxWidth: isBoundary ? '400px' : '220px',
            boxShadow: isBoundary ? 'none' : '0 8px 16px rgba(0,0,0,0.5)',
            fontFamily: 'var(--vscode-font-family, sans-serif)',
            opacity: isBoundary ? 0.8 : 1,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
            <Handle type="target" position={Position.Top} style={{ background: '#555', border: 'none', width: '8px', height: '8px' }} />

            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ flex: 1, paddingRight: '8px' }}>
                    {isEditing ? (
                        <input
                            autoFocus
                            value={tempLabel}
                            onChange={(e) => setTempLabel(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            style={{
                                width: '100%',
                                background: 'var(--vscode-input-background, #3c3c3c)',
                                color: '#fff',
                                border: '1px solid #007acc',
                                borderRadius: '3px',
                                fontSize: isBoundary ? '14px' : '12px',
                                padding: '2px 4px',
                                outline: 'none'
                            }}
                        />
                    ) : (
                        <div 
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                            className="node-label"
                            style={{ 
                                fontSize: isBoundary ? '16px' : '13px', 
                                fontWeight: 700, 
                                cursor: 'text',
                                padding: '2px 0',
                                borderRadius: '4px',
                                transition: 'background 0.2s',
                                wordBreak: 'break-word',
                                display: 'inline-block',
                                color: selected ? '#fff' : '#efefef'
                            }}
                        >
                            {data.label}
                        </div>
                    )}
                </div>
                {!isBoundary && !isNote && TYPE_BADGE[nodeType] && (
                    <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: TYPE_BORDER[nodeType] || '#555', color: '#fff', fontWeight: 'bold', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                        {TYPE_BADGE[nodeType]}
                    </span>
                )}
            </div>

            {/* Interface summary */}
            {iface && (
                <div style={{ borderTop: isBoundary ? 'none' : '1px solid rgba(255,255,255,0.08)', paddingTop: '5px', marginBottom: '5px' }}>
                    {renderInterfaceSummary(iface)}
                </div>
            )}

            {/* Footer row - Hidden for boundary nodes */}
            {!isBoundary && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                    <div style={{ fontSize: '11px', color: data.isExecuted ? '#4caf50' : '#aaa' }}>
                        {isNote ? 'Doc' : (data.isExecuted ? '✓ Executed' : data.status || 'Draft')}
                    </div>
                    {data.onExecute && !isNote && (
                        <button
                            onClick={(e) => { e.stopPropagation(); data.onExecute(data.id); }}
                            disabled={isLocked}
                            title={data.isExecuting ? 'Generating...' : data.isExecuted ? 'Already executed. Update spec to re-enable.' : 'Execute: generate code from this spec'}
                            style={{
                                fontSize: '10px', padding: '2px 6px',
                                background: isLocked ? '#444' : '#007acc',
                                color: isLocked ? '#777' : '#fff',
                                border: 'none', borderRadius: '4px',
                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                opacity: isLocked ? 0.6 : 1,
                                transition: 'all 0.2s'
                            }}>
                            {data.isExecuting ? '⏳' : data.isExecuted ? '✓' : '▶'}
                        </button>
                    )}
                </div>
            )}

            <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
        </div>
    );
}

