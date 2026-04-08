import React, { useState } from 'react';

interface SpecData {
    spec_interface?: { raw: string; structured: any[] };
    spec_constraints?: string;
    spec_interactions?: string;
    spec_metadata?: string;
}

interface SpecBuilderProps {
    nodeId: string;
    initialData: SpecData;
    onSave: (nodeId: string, updatedData: SpecData) => void;
    onClose: () => void;
}

const TABS = [
    { key: 'spec_interface',    label: '1. Interface',    placeholder: 'REST routes, GraphQL schemas, endpoints...' },
    { key: 'spec_constraints',  label: '2. Constraints',  placeholder: 'Data ranges, validation rules, business logic...' },
    { key: 'spec_interactions', label: '3. Interactions', placeholder: 'Status codes, error handling, event flows...' },
    { key: 'spec_metadata',     label: '4. Metadata',     placeholder: 'Version, auth schemes, descriptions...' },
] as const;

function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Apply inline formatting (bold, italic, inline code) to a plain-text line */
function applyInline(s: string): string {
    return s
        .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.35);padding:1px 5px;border-radius:3px;font-family:monospace;font-size:12px">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

/** Minimal Markdown → HTML renderer — block-first line parser */
function renderMarkdown(raw: string): string {
    if (!raw || !raw.trim()) return '<em style="color:#666">Nothing here yet.</em>';

    // If content looks like pure JSON, render as a pretty code block
    try {
        const parsed = JSON.parse(raw);
        return `<pre style="background:rgba(0,0,0,0.4);padding:12px;border-radius:4px;overflow-x:auto;font-size:12px;white-space:pre-wrap">${escapeHtml(JSON.stringify(parsed, null, 2))}</pre>`;
    } catch { /* not JSON, continue */ }

    // Strip fenced code blocks first so we never run inline processing inside them
    const CODE_BLOCKS: string[] = [];
    const withCodePlaceholders = raw.replace(/```[\s\S]*?```/g, (match) => {
        const inner = match.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
        const idx = CODE_BLOCKS.length;
        CODE_BLOCKS.push(`<pre style="background:rgba(0,0,0,0.45);padding:10px;border-radius:4px;overflow-x:auto;font-size:12px;white-space:pre-wrap"><code>${escapeHtml(inner)}</code></pre>`);
        return `\x00CODE${idx}\x00`;
    });

    const lines = withCodePlaceholders.split('\n');
    const out: string[] = [];
    let listBuffer: string[] = [];

    const flushList = () => {
        if (listBuffer.length > 0) {
            out.push(`<ul style="margin:6px 0;padding-left:18px;line-height:1.7">${listBuffer.join('')}</ul>`);
            listBuffer = [];
        }
    };

    for (const line of lines) {
        // Code block placeholder
        if (/^\x00CODE\d+\x00$/.test(line.trim())) {
            flushList();
            const idx = parseInt(line.match(/\d+/)![0]);
            out.push(CODE_BLOCKS[idx]);
            continue;
        }

        // HR
        if (/^---+$/.test(line.trim())) {
            flushList();
            out.push('<hr style="border:none;border-top:1px solid var(--vscode-panel-border);margin:10px 0"/>');
            continue;
        }

        // Headings
        const h3 = line.match(/^###\s+(.+)/);
        if (h3) { flushList(); out.push(`<h3 style="margin:12px 0 4px;font-size:13px">${applyInline(h3[1])}</h3>`); continue; }
        const h2 = line.match(/^##\s+(.+)/);
        if (h2) { flushList(); out.push(`<h2 style="margin:14px 0 6px;font-size:14px">${applyInline(h2[1])}</h2>`); continue; }
        const h1 = line.match(/^#\s+(.+)/);
        if (h1) { flushList(); out.push(`<h1 style="margin:14px 0 8px;font-size:16px">${applyInline(h1[1])}</h1>`); continue; }

        // List items (unordered or ordered)
        const li = line.match(/^(?:[-*]|\d+\.)\s+(.+)/);
        if (li) { listBuffer.push(`<li style="margin:3px 0">${applyInline(li[1])}</li>`); continue; }

        // Blank line
        if (!line.trim()) { flushList(); out.push('<br/>'); continue; }

        // Regular paragraph
        flushList();
        out.push(`<p style="margin:4px 0;line-height:1.6">${applyInline(line)}</p>`);
    }

    flushList();
    return out.join('\n');
}



const TAB_STYLE_BASE: React.CSSProperties = {
    padding: '8px 14px',
    fontSize: '12px',
    cursor: 'pointer',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    color: 'var(--vscode-foreground)',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s, border-color 0.15s',
};

const SpecBuilder: React.FC<SpecBuilderProps> = ({ nodeId, initialData, onSave, onClose }) => {
    const [viewMode, setViewMode] = useState<'raw' | 'preview' | 'structured'>('raw');
    const [activeTab, setActiveTab] = useState<typeof TABS[number]['key']>('spec_interface');
    const [specData, setSpecData] = useState<SpecData>(initialData);

    const currentTab = TABS.find(t => t.key === activeTab)!;

    return (
        <div style={{
            position: 'absolute', top: 0, right: 0, width: '420px', height: '100vh',
            background: 'var(--vscode-editor-background)',
            borderLeft: '1px solid var(--vscode-panel-border)',
            boxSizing: 'border-box',
            color: 'var(--vscode-editor-foreground)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--vscode-panel-border)', flexShrink: 0 }}>
                <div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>Spec: {nodeId}</div>
                    <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', marginTop: '2px' }}>Specification-Driven Definition</div>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--vscode-foreground)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, marginLeft: '4px' }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--vscode-panel-border)', flexShrink: 0, overflowX: 'auto' }}>
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => {
                            setActiveTab(tab.key);
                            if (tab.key !== 'spec_interface' && viewMode === 'structured') {
                                setViewMode('raw');
                            }
                        }}
                        style={{
                            ...TAB_STYLE_BASE,
                            borderBottomColor: activeTab === tab.key ? 'var(--vscode-focusBorder, #007acc)' : 'transparent',
                            color: activeTab === tab.key ? 'var(--vscode-focusBorder, #007acc)' : 'var(--vscode-foreground)',
                            fontWeight: activeTab === tab.key ? 'bold' : 'normal',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* View Mode Switcher (Moved within tab area) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '10px 16px 0', flexShrink: 0 }}>
                <button
                    onClick={() => setViewMode('raw')}
                    style={{ fontSize: '10px', padding: '2px 8px', cursor: 'pointer', borderRadius: '2px', border: '1px solid var(--vscode-input-border)',
                        background: viewMode === 'raw' ? 'var(--vscode-button-background)' : 'transparent',
                        color: viewMode === 'raw' ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)'
                    }}
                >Raw</button>
                <button
                    onClick={() => setViewMode('preview')}
                    style={{ fontSize: '10px', padding: '2px 8px', cursor: 'pointer', borderRadius: '2px', border: '1px solid var(--vscode-input-border)',
                        background: viewMode === 'preview' ? 'var(--vscode-button-background)' : 'transparent',
                        color: viewMode === 'preview' ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)'
                    }}
                >Preview</button>
                {activeTab === 'spec_interface' && (
                    <button
                        onClick={() => setViewMode('structured')}
                        style={{ fontSize: '10px', padding: '2px 8px', cursor: 'pointer', borderRadius: '2px', border: '1px solid var(--vscode-input-border)',
                            background: viewMode === 'structured' ? 'var(--vscode-button-background)' : 'transparent',
                            color: viewMode === 'structured' ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)'
                        }}
                    >Structured</button>
                )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: '10px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {viewMode === 'raw' ? (
                    <textarea
                        key={activeTab + '_raw'}
                        value={activeTab === 'spec_interface' ? (specData.spec_interface as any)?.raw || '' : (specData as any)[activeTab] || ''}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (activeTab === 'spec_interface') {
                                setSpecData(prev => ({
                                    ...prev,
                                    spec_interface: {
                                        raw: val,
                                        structured: (prev.spec_interface as any)?.structured || []
                                    }
                                }));
                            } else {
                                setSpecData(prev => ({ ...prev, [activeTab]: val }));
                            }
                        }}
                        placeholder={currentTab.placeholder}
                        style={{
                            flex: 1,
                            width: '100%',
                            boxSizing: 'border-box',
                            background: 'var(--vscode-input-background)',
                            color: 'var(--vscode-input-foreground)',
                            border: '1px solid var(--vscode-input-border)',
                            borderRadius: '4px',
                            resize: 'none',
                            fontFamily: 'var(--vscode-editor-font-family, monospace)',
                            fontSize: '13px',
                            lineHeight: '1.6',
                            padding: '10px',
                            minHeight: '300px',
                        }}
                    />
                ) : viewMode === 'preview' ? (
                    <div
                        key={activeTab + '_preview'}
                        dangerouslySetInnerHTML={{ 
                            __html: renderMarkdown(
                                activeTab === 'spec_interface' 
                                    ? ((specData.spec_interface as any)?.raw || '') 
                                    : ((specData as any)[activeTab] || '')
                            )
                        }}
                        style={{
                            flex: 1,
                            padding: '12px',
                            background: 'var(--vscode-editor-background)',
                            border: '1px solid var(--vscode-panel-border)',
                            borderRadius: '4px',
                            fontSize: '13px',
                            lineHeight: '1.7',
                            color: 'var(--vscode-editor-foreground)',
                            minHeight: '300px',
                        }}
                    />
                ) : (
                    <div key={activeTab + '_structured'} style={{ flex: 1, fontSize: '13px' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '10px', color: 'var(--vscode-descriptionForeground)', fontSize: '11px', textTransform: 'uppercase' }}>Parsed Spec Interface (Contract)</div>
                        {((specData.spec_interface as any)?.structured || []).length > 0 ? (
                           <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: '4px', overflow: 'hidden' }}>
                               <thead>
                                   <tr style={{ background: 'rgba(255,255,255,0.05)', textAlign: 'left' }}>
                                       <th style={{ padding: '8px', border: '1px solid var(--vscode-panel-border)', fontSize: '11px' }}>Method</th>
                                       <th style={{ padding: '8px', border: '1px solid var(--vscode-panel-border)', fontSize: '11px' }}>Path / Action</th>
                                   </tr>
                               </thead>
                               <tbody>
                                   {((specData.spec_interface as any).structured).map((item: any, i: number) => (
                                       <tr key={i}>
                                            <td style={{ padding: '8px', border: '1px solid var(--vscode-panel-border)', fontFamily: 'monospace', color: '#3498db' }}>{item.method || 'GET'}</td>
                                            <td style={{ padding: '8px', border: '1px solid var(--vscode-panel-border)', fontFamily: 'monospace' }}>{item.path || item.name || '/'}</td>
                                       </tr>
                                   ))}
                               </tbody>
                           </table>
                        ) : (
                            <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>No structured endpoints found. Refine your spec to extract interface data.</div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer — only show Save in Edit/Structured mode (though structured is RO, good for context) */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--vscode-panel-border)', flexShrink: 0 }}>
                {viewMode === 'preview' && (
                    <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', marginBottom: '8px' }}>
                        Switch to Raw to edit this spec pillar.
                    </div>
                )}
                <button
                    onClick={() => onSave(nodeId, specData)}
                    disabled={viewMode === 'preview'}
                    style={{
                        width: '100%', padding: '9px',
                        background: viewMode === 'preview' ? 'rgba(255,255,255,0.05)' : 'var(--vscode-button-background)',
                        color: viewMode === 'preview' ? 'var(--vscode-disabledForeground, #666)' : 'var(--vscode-button-foreground)',
                        border: 'none', borderRadius: '3px',
                        cursor: viewMode === 'preview' ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold', fontSize: '13px',
                        transition: 'all 0.15s'
                    }}
                >
                    Save Architecture
                </button>
            </div>
        </div>
    );
};

export default SpecBuilder;
