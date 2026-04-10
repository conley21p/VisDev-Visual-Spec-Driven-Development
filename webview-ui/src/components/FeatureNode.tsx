import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export default function FeatureNode({ data, selected, type, id, onUpdateField }: NodeProps & { onUpdateField: (nodeId: string, path: string, value: any) => void }) {
    const raw = data.raw || {};
    const info = raw.info || {};
    const schemas = raw.components?.schemas || {};

    const [editingPath, setEditingPath] = useState<string | null>(null);
    const [tempValue, setTempValue] = useState<string>('');

    const startEditing = (path: string, initialValue: string) => {
        setEditingPath(path);
        setTempValue(initialValue);
    };

    const handleSave = () => {
        if (editingPath) {
            onUpdateField(id, editingPath, tempValue);
            setEditingPath(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') setEditingPath(null);
    };

    const borderColor = data.color || (type === 'core' ? '#2ecc71' : type === 'edge' ? '#3498db' : '#95a5a6');

    return (
        <div style={{
            padding: '12px',
            borderRadius: '12px',
            background: '#1e1e1e',
            color: '#eee',
            border: `2px solid ${selected ? '#007acc' : borderColor}`,
            minWidth: '220px',
            boxShadow: '0 10px 20px rgba(0,0,0,0.6)',
            fontFamily: 'Inter, system-ui, sans-serif',
            transition: 'border 0.2s ease'
        }}>
            {/* Type Badge */}
            <div style={{ 
                fontSize: '9px', 
                fontWeight: 'bold', 
                textTransform: 'uppercase', 
                color: borderColor,
                marginBottom: '4px',
                letterSpacing: '0.5px'
            }}>
                {type || 'Spec'}
            </div>

            {/* Editable Title */}
            {editingPath === 'info.title' ? (
                <input 
                    autoFocus 
                    value={tempValue} 
                    onChange={e => setTempValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    style={{ background: '#333', color: '#fff', border: '1px solid #007acc', width: '100%', borderRadius: '4px', fontSize: '14px', marginBottom: '8px' }}
                />
            ) : (
                <div 
                    onClick={() => startEditing('info.title', info.title || '')}
                    style={{ fontSize: '15px', fontWeight: 600, color: '#fff', cursor: 'text', marginBottom: '4px' }}
                >
                    {info.title || 'Untitled Spec'}
                </div>
            )}

            {/* Editable Description */}
            {editingPath === 'info.description' ? (
                <textarea 
                    autoFocus
                    value={tempValue}
                    onChange={e => setTempValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    style={{ background: '#333', color: '#bbb', border: '1px solid #007acc', width: '100%', borderRadius: '4px', fontSize: '11px', marginBottom: '12px', height: '40px' }}
                />
            ) : (
                <div 
                    onClick={() => startEditing('info.description', info.description || '')}
                    style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', cursor: 'text', marginBottom: '12px', lineHeight: '1.4' }}
                >
                    {info.description || 'No description provided.'}
                </div>
            )}

            {/* API Endpoints */}
            {raw.paths && Object.keys(raw.paths).length > 0 && (
                <div style={{ marginBottom: '16px', borderTop: '1px solid #333', paddingTop: '8px' }}>
                    <div style={{ fontSize: '10px', color: borderColor, fontWeight: 'bold', marginBottom: '6px', letterSpacing: '0.5px' }}>
                        API ENDPOINTS
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {Object.entries(raw.paths).map(([path, pathItem]: [string, any]) => (
                            <div key={path} style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.03)', padding: '4px 8px', borderRadius: '4px' }}>
                                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#ccc', wordBreak: 'break-all' }}>
                                    {path}
                                </div>
                                <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                                    {Object.keys(pathItem || {}).filter(m => ['get', 'post', 'put', 'delete', 'patch'].includes(m.toLowerCase())).map(method => (
                                        <span key={method} style={{ 
                                            fontSize: '8px', 
                                            fontWeight: 'bold', 
                                            padding: '1px 4px', 
                                            borderRadius: '2px', 
                                            background: method.toLowerCase() === 'get' ? 'rgba(46, 204, 113, 0.2)' : 
                                                       (method.toLowerCase() === 'post' ? 'rgba(52, 152, 219, 0.2)' : 'rgba(231, 76, 60, 0.2)'),
                                            color: method.toLowerCase() === 'get' ? '#2ecc71' : 
                                                   (method.toLowerCase() === 'post' ? '#3498db' : '#e74c3c'),
                                            textTransform: 'uppercase'
                                        }}>
                                            {method}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Schema Sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Object.entries(schemas).map(([schemaName, schema]: [string, any]) => (
                    <div key={schemaName} style={{ borderTop: '1px solid #333', paddingTop: '8px' }}>
                        <div style={{ fontSize: '10px', color: borderColor, fontWeight: 'bold', marginBottom: '6px' }}>
                            SCHEMA: {schemaName}
                        </div>
                        
                        {/* Properties */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {Object.entries(schema.properties || {}).map(([propName, prop]: [string, any]) => {
                                const propPath = `components.schemas.${schemaName}.properties.${propName}`;
                                const hasLink = prop['x-link-target'] !== undefined;

                                return (
                                    <div key={propName} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#252525', padding: '4px 8px', borderRadius: '4px', border: hasLink ? `1px solid ${borderColor}` : '1px solid transparent' }}>
                                        {/* Linking Handles */}
                                        <Handle 
                                            type="target" 
                                            position={Position.Left} 
                                            id={propPath}
                                            style={{ left: '-6px', background: borderColor, width: '8px', height: '8px', border: 'none' }} 
                                        />
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 500, color: '#ccc' }}>{propName}</span>
                                            <span style={{ fontSize: '9px', color: '#666' }}>{prop.type || 'any'}</span>
                                        </div>

                                        {hasLink && (
                                            <div style={{ fontSize: '10px', color: borderColor }}>🔗</div>
                                        )}

                                        <Handle 
                                            type="source" 
                                            position={Position.Right} 
                                            id={propPath}
                                            style={{ right: '-6px', background: borderColor, width: '8px', height: '8px', border: 'none' }} 
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Global Input/Output Handles */}
            <Handle type="target" position={Position.Top} style={{ background: '#555', opacity: 0.2 }} />
            <Handle type="source" position={Position.Bottom} style={{ background: '#555', opacity: 0.2 }} />
        </div>
    );
}
