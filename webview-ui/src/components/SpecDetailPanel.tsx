import React, { useState } from 'react';

interface TestScenario {
    name: string;
    scenario: string;
    expected: string;
}

interface SpecDetailPanelProps {
    node: any;
    onClose: () => void;
}

type TabType = 'general' | 'endpoints' | 'test' | 'schema';

export default function SpecDetailPanel({ node, onClose }: SpecDetailPanelProps) {
    const [activeTab, setActiveTab] = useState<TabType>('general');

    if (!node) return null;

    const raw = node.data?.raw || {};
    const info = raw.info || {};
    const tests: TestScenario[] = info['x-visdev-tests'] || [];
    const paths = raw.paths || {};
    const schemas = raw.components?.schemas || {};
    const borderColor = node.data?.color || '#2ecc71';

    const renderTabButton = (id: TabType, label: string) => {
        const isActive = activeTab === id;
        return (
            <button
                onClick={() => setActiveTab(id)}
                style={{
                    padding: '8px 16px',
                    background: isActive ? `${borderColor}22` : 'transparent',
                    border: 'none',
                    borderBottom: `2px solid ${isActive ? borderColor : 'transparent'}`,
                    color: isActive ? '#fff' : '#888',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                }}
            >
                {label}
            </button>
        );
    };

    const renderGeneral = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <section>
                <div style={{ fontSize: '9px', fontWeight: 800, color: '#666', textTransform: 'uppercase', marginBottom: '8px' }}>Description</div>
                <div style={{ fontSize: '13px', color: '#bbb', lineHeight: '1.6' }}>
                    {info.description || 'No description provided.'}
                </div>
            </section>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <section>
                    <div style={{ fontSize: '9px', fontWeight: 800, color: '#666', textTransform: 'uppercase', marginBottom: '4px' }}>Version</div>
                    <div style={{ fontSize: '12px', color: '#fff' }}>{info.version || '1.0.0'}</div>
                </section>
                <section>
                    <div style={{ fontSize: '9px', fontWeight: 800, color: '#666', textTransform: 'uppercase', marginBottom: '4px' }}>Layer</div>
                    <div style={{ fontSize: '12px', color: borderColor, fontWeight: 700 }}>{info['x-visdev-layer'] || 'core'}</div>
                </section>
            </div>

            <section>
                <div style={{ fontSize: '9px', fontWeight: 800, color: '#666', textTransform: 'uppercase', marginBottom: '4px' }}>File Path</div>
                <div style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '4px' }}>
                    {node.id}
                </div>
            </section>
        </div>
    );

    const renderEndpoints = () => {
        const pathKeys = Object.keys(paths);
        if (pathKeys.length === 0) {
            return <div style={{ textAlign: 'center', marginTop: '40px', color: '#666', fontSize: '13px' }}>No endpoints defined.</div>;
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {pathKeys.map(path => (
                    <div key={path} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.2)', fontSize: '11px', fontFamily: 'monospace', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            {path}
                        </div>
                        <div style={{ padding: '12px' }}>
                            {Object.keys(paths[path]).map(method => (
                                <div key={method} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <span style={{ 
                                        fontSize: '9px', 
                                        fontWeight: 900, 
                                        padding: '2px 6px', 
                                        borderRadius: '4px', 
                                        background: method === 'get' ? '#3498db' : method === 'post' ? '#2ecc71' : '#e67e22',
                                        color: '#fff',
                                        textTransform: 'uppercase',
                                        minWidth: '35px',
                                        textAlign: 'center'
                                    }}>
                                        {method}
                                    </span>
                                    <span style={{ fontSize: '12px', color: '#ccc' }}>{paths[path][method].summary || 'No summary'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderTests = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {tests.length === 0 ? (
                <div style={{ textAlign: 'center', marginTop: '40px', color: '#666' }}>
                    <div style={{ fontSize: '32px', marginBottom: '16px' }}>🧪</div>
                    <div style={{ fontSize: '14px' }}>No test scenarios defined.</div>
                </div>
            ) : (
                tests.map((test, idx) => (
                    <div key={idx} style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        borderRadius: '12px',
                        padding: '16px',
                        border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: borderColor }}></div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>{test.name}</div>
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#666', textTransform: 'uppercase', marginBottom: '4px' }}>Scenario</div>
                            <div style={{ fontSize: '12px', color: '#bbb', lineHeight: '1.5' }}>{test.scenario}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '9px', fontWeight: 800, color: '#666', textTransform: 'uppercase', marginBottom: '4px' }}>Expected</div>
                            <div style={{ 
                                fontSize: '11px', 
                                color: borderColor, 
                                background: borderColor + '11', 
                                padding: '8px 10px', 
                                borderRadius: '6px',
                                borderLeft: `2px solid ${borderColor}`
                            }}>
                                {test.expected}
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );

    const renderSchema = () => {
        const schemaKeys = Object.keys(schemas);
        if (schemaKeys.length === 0) {
            return <div style={{ textAlign: 'center', marginTop: '40px', color: '#666', fontSize: '13px' }}>No schemas defined.</div>;
        }

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {schemaKeys.map(key => (
                    <div key={key}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ opacity: 0.5 }}>{'{ }'}</span> {key}
                        </div>
                        <div style={{ paddingLeft: '12px', borderLeft: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {schemas[key].properties && Object.keys(schemas[key].properties).map(prop => (
                                <div key={prop} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                    <span style={{ color: '#ccc' }}>{prop}</span>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        {schemas[key].properties[prop]['x-link-target'] && (
                                            <span title="Relational Link" style={{ fontSize: '10px' }}>🔗</span>
                                        )}
                                        <span style={{ color: borderColor, fontSize: '11px', opacity: 0.8 }}>
                                            {schemas[key].properties[prop].type || 'object'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '450px',
            background: 'rgba(18, 18, 18, 0.9)',
            backdropFilter: 'blur(30px)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '-15px 0 45px rgba(0,0,0,0.6)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: '#eee'
        }}>
            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); borderRadius: 3px; }
                ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>

            {/* Header */}
            <div style={{ padding: '24px 24px 16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: borderColor, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                        Specification Detail
                    </div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff', letterSpacing: '-0.4px' }}>
                        {info.title || 'Untitled Spec'}
                    </h2>
                </div>
                <button onClick={onClose} style={{
                    background: 'rgba(255,255,255,0.05)', border: 'none', color: '#888', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
                }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '0 12px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', gap: '4px', overflowX: 'auto' }}>
                {renderTabButton('general', 'General')}
                {renderTabButton('endpoints', 'Endpoints')}
                {renderTabButton('test', 'Tests')}
                {renderTabButton('schema', 'Schema')}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                {activeTab === 'general' && renderGeneral()}
                {activeTab === 'endpoints' && renderEndpoints()}
                {activeTab === 'test' && renderTests()}
                {activeTab === 'schema' && renderSchema()}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', background: 'rgba(0,0,0,0.2)' }}>
                <div style={{ fontSize: '11px', color: '#555', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{info.version || 'v1.0.0'}</span>
                    <span style={{ fontWeight: 700 }}>VISDEV ENGINE</span>
                </div>
            </div>
        </div>
    );
}
