import React, { useState } from 'react';

interface SettingsModalProps {
    currentConfig: any;
    onSave: (config: any) => void;
    onDemo: () => void;
}

export default function SettingsModal({ currentConfig, onSave, onDemo }: SettingsModalProps) {
    const [name, setName] = useState(currentConfig?.name === "New VisDev Project" ? "" : currentConfig?.name || "");
    const [description, setDescription] = useState(currentConfig?.description || "");
    const [preferredModel, setPreferredModel] = useState(currentConfig?.preferredModel || "google/gemini-2.0-flash-001");
    const [specRoot, setSpecRoot] = useState(currentConfig?.specRoot || "specs");

    const handleSave = () => {
        onSave({
            ...currentConfig,
            name: name || "Untitled VisDev Project",
            description,
            preferredModel,
            specRoot
        });
    };

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(18, 18, 18, 0.8)',
            backdropFilter: 'blur(10px)',
            color: '#fff',
            zIndex: 1000,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            <div style={{
                width: '100%', maxWidth: '460px',
                padding: '32px',
                background: 'rgba(30, 30, 30, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                borderRadius: '16px'
            }}>
                <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '24px', fontWeight: 800 }}>Project Blueprint</h2>
                <p style={{ color: '#888', marginBottom: '24px', fontSize: '13px' }}>Configure your architectural source of truth.</p>
                
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: '#aaa' }}>Project Name</label>
                    <input 
                        value={name} 
                        onChange={(e: any) => setName(e.target.value)} 
                        placeholder="e.g. QuickShop Backend"
                        style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', outline: 'none' }} 
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: '#aaa' }}>Specification Root</label>
                    <input 
                        value={specRoot} 
                        onChange={(e: any) => setSpecRoot(e.target.value)} 
                        placeholder="e.g. specs"
                        style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', outline: 'none' }} 
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: '#aaa' }}>Reasoning AI Model</label>
                    <select 
                        value={preferredModel} 
                        onChange={(e: any) => setPreferredModel(e.target.value)}
                        style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', outline: 'none' }}
                    >
                        <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
                        <option value="meta/llama-3.3-70b-instruct">Llama 3.3 70B</option>
                        <option value="nvidia/llama-3.1-405b-instruct">Llama 3.1 405B (Refining)</option>
                    </select>
                </div>

                <div style={{ marginBottom: '32px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: '#aaa' }}>Description</label>
                    <textarea 
                        value={description} 
                        onChange={(e: any) => setDescription(e.target.value)} 
                        rows={2}
                        placeholder="Describe the high-level goals of this architecture..."
                        style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', outline: 'none', resize: 'none' }} 
                    />
                </div>

                <button 
                    onClick={handleSave}
                    style={{
                        width: '100%', 
                        padding: '14px', 
                        backgroundColor: '#007acc', 
                        color: '#fff', 
                        border: 'none', 
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontSize: '14px',
                        marginBottom: '12px',
                        transition: 'transform 0.1s'
                    }}
                >
                    Initialize Blueprint
                </button>
                <button 
                    onClick={onDemo}
                    style={{
                        width: '100%', 
                        padding: '12px', 
                        backgroundColor: 'transparent', 
                        color: '#aaa', 
                        border: '1px dashed rgba(255,255,255,0.2)', 
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: '12px'
                    }}
                >
                    Scaffold Demo Specs (Grocery API)
                </button>
            </div>
        </div>
    );
}
