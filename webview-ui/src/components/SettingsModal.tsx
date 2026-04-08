import React, { useState } from 'react';

interface SettingsModalProps {
    currentConfig: any;
    onSave: (config: any) => void;
    onDemo: () => void;
}

export default function SettingsModal({ currentConfig, onSave, onDemo }: SettingsModalProps) {
    const [name, setName] = useState(currentConfig?.name === "New VisDev Project" ? "" : currentConfig?.name || "");
    const [description, setDescription] = useState(currentConfig?.description || "");
    const [frontend, setFrontend] = useState(currentConfig?.techStack?.frontend || "React/TypeScript");
    const [backend, setBackend] = useState(currentConfig?.techStack?.backend || "Serverless AWS API Gateway/Lambda");
    const [database, setDatabase] = useState(currentConfig?.techStack?.database || "DynamoDB (NoSQL)");
    const [preferredModel, setPreferredModel] = useState(currentConfig?.preferredModel || "moonshotai/kimi-k2.5");

    const handleSave = () => {
        onSave({
            ...currentConfig,
            name: name || "Untitled VisDev Project",
            description,
            techStack: { frontend, backend, database },
            preferredModel
        });
    };

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'var(--vscode-editor-background)',
            color: 'var(--vscode-editor-foreground)',
            zIndex: 1000,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
            fontFamily: 'var(--vscode-font-family)'
        }}>
            <div style={{
                width: '100%', maxWidth: '500px',
                padding: '24px',
                border: '1px solid var(--vscode-editorGroup-border)',
                backgroundColor: 'var(--vscode-sideBar-background)',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                borderRadius: '6px'
            }}>
                <h2 style={{ marginTop: 0, marginBottom: '20px', color: 'var(--vscode-editor-foreground)' }}>VisDev Project Configuration</h2>
                
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Project Name</label>
                    <input 
                        value={name} 
                        onChange={(e: any) => setName(e.target.value)} 
                        placeholder="e.g. Acme Ecommerce"
                        style={{ width: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: '2px' }} 
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Reasoning Model (NVIDIA NIM)</label>
                    <select 
                        value={preferredModel} 
                        onChange={(e: any) => setPreferredModel(e.target.value)}
                        style={{ width: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: 'var(--vscode-dropdown-background)', color: 'var(--vscode-dropdown-foreground)', border: '1px solid var(--vscode-dropdown-border)' }}
                    >
                        <option value="moonshotai/kimi-k2.5">NVIDIA / Moonshot Kimi K2.5</option>
                        <option value="google/gemma-4-31b-it">Google Gemma 4 31B IT</option>
                        <option value="nvidia/nemotron-3-super-120b-a12b">NVIDIA Nemotron-3 Super 120B</option>
                    </select>
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Description / Purpose</label>
                    <textarea 
                        value={description} 
                        onChange={(e: any) => setDescription(e.target.value)} 
                        rows={2}
                        style={{ width: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: '2px', resize: 'vertical' }} 
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Frontend Architecture</label>
                    <select 
                        value={frontend} 
                        onChange={(e: any) => setFrontend(e.target.value)}
                        style={{ width: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: 'var(--vscode-dropdown-background)', color: 'var(--vscode-dropdown-foreground)', border: '1px solid var(--vscode-dropdown-border)' }}
                    >
                        <option>React/TypeScript</option>
                        <option>Next.js (App Router)</option>
                        <option>Vue/Nuxt</option>
                        <option>Vanilla HTML/JS</option>
                        <option>None (API Only)</option>
                    </select>
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Backend Architecture</label>
                    <select 
                        value={backend} 
                        onChange={(e: any) => setBackend(e.target.value)}
                        style={{ width: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: 'var(--vscode-dropdown-background)', color: 'var(--vscode-dropdown-foreground)', border: '1px solid var(--vscode-dropdown-border)' }}
                    >
                        <option>Serverless AWS API Gateway/Lambda</option>
                        <option>Node.js Express API</option>
                        <option>Python FastAPI</option>
                        <option>Ruby on Rails (Monolith)</option>
                        <option>None (Static Site)</option>
                    </select>
                </div>

                <div style={{ marginBottom: '25px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold' }}>Database</label>
                    <select 
                        value={database} 
                        onChange={(e: any) => setDatabase(e.target.value)}
                        style={{ width: '100%', padding: '8px', boxSizing: 'border-box', backgroundColor: 'var(--vscode-dropdown-background)', color: 'var(--vscode-dropdown-foreground)', border: '1px solid var(--vscode-dropdown-border)' }}
                    >
                        <option>PostgreSQL</option>
                        <option>DynamoDB (NoSQL)</option>
                        <option>MongoDB</option>
                        <option>SQLite</option>
                        <option>None</option>
                    </select>
                </div>

                <button 
                    onClick={handleSave}
                    style={{
                        width: '100%', 
                        padding: '10px', 
                        backgroundColor: 'transparent', 
                        color: 'var(--vscode-button-background)', 
                        border: '1px solid var(--vscode-button-background)', 
                        borderRadius: '2px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        marginBottom: '10px'
                    }}
                >
                    Save Project Constraints
                </button>
                <button 
                    onClick={onDemo}
                    style={{
                        width: '100%', 
                        padding: '10px', 
                        backgroundColor: 'var(--vscode-button-background)', 
                        color: 'var(--vscode-button-foreground)', 
                        border: 'none', 
                        borderRadius: '2px',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    Generate 3-Node Demo Architecture (Quickstart)
                </button>
            </div>
        </div>
    );
}
