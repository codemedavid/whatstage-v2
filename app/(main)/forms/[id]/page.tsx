'use client';

import { useState, useEffect, use } from 'react';
import {
    Save,
    ArrowLeft,
    Plus,
    Trash2,
    GripVertical,
    Settings,
    Eye,
    CheckCircle2,
    Layers,
    Upload,
    CreditCard,
    Pencil,
    ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Step {
    label: string;
}

interface Field {
    id?: string;
    label: string;
    field_type: string;
    is_required: boolean;
    options?: string[];
    placeholder?: string;
    mapping_field?: string | null;
    use_separator?: boolean;
    step_number: number;
}

interface Form {
    id: string;
    title: string;
    description: string;
    pipeline_stage_id: string;
    page_id: string | null;
    settings: {
        steps?: Step[];
        payment_instructions?: string;
        payment_options?: string[];
        [key: string]: any;
    };
    fields: Field[];
}

interface PipelineStage {
    id: string;
    name: string;
}

interface ConnectedPage {
    page_id: string;
    page_name: string;
}

export default function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);

    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<Form | null>(null);
    const [stages, setStages] = useState<PipelineStage[]>([]);
    const [pages, setPages] = useState<ConnectedPage[]>([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [activeStep, setActiveStep] = useState(1);
    const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);

    // Get steps from form settings or default
    const steps: Step[] = form?.settings?.steps || [{ label: 'Step 1' }];

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch Stages
                const stagesRes = await fetch('/api/pipeline/stages');
                const stagesData = await stagesRes.json();
                if (Array.isArray(stagesData)) setStages(stagesData);

                // Fetch Connected Pages for Messenger redirect
                const pagesRes = await fetch('/api/facebook/pages');
                const pagesData = await pagesRes.json();
                // API returns { pages: [...] }
                if (pagesData.pages && Array.isArray(pagesData.pages)) {
                    setPages(pagesData.pages);
                }

                // Fetch Form
                const formRes = await fetch(`/api/forms/${id}`);
                if (!formRes.ok) throw new Error('Form not found');
                const formData = await formRes.json();

                // Ensure fields have step_number (default to 1)
                if (formData.fields) {
                    formData.fields = formData.fields.map((f: Field) => ({
                        ...f,
                        step_number: f.step_number || 1
                    }));
                } else {
                    formData.fields = [];
                }

                // Ensure settings has steps
                if (!formData.settings) formData.settings = {};
                if (!formData.settings.steps) {
                    formData.settings.steps = [{ label: 'Step 1' }];
                }

                setForm(formData);

            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id]);

    const handleSave = async () => {
        if (!form) return;
        setSaving(true);
        setSuccess('');
        setError('');

        try {
            const res = await fetch(`/api/forms/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });

            if (!res.ok) throw new Error('Failed to save');

            setSuccess('Form saved successfully!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const addStep = () => {
        if (!form) return;
        const newSteps = [...steps, { label: `Step ${steps.length + 1}` }];
        setForm({
            ...form,
            settings: { ...form.settings, steps: newSteps }
        });
        setActiveStep(newSteps.length);
    };

    const removeStep = (stepIndex: number) => {
        if (!form || steps.length <= 1) return;
        const stepNumber = stepIndex + 1;

        // Remove step and renumber remaining fields
        const newSteps = steps.filter((_, i) => i !== stepIndex);
        const newFields = form.fields
            .filter(f => f.step_number !== stepNumber)
            .map(f => ({
                ...f,
                step_number: f.step_number > stepNumber ? f.step_number - 1 : f.step_number
            }));

        setForm({
            ...form,
            settings: { ...form.settings, steps: newSteps },
            fields: newFields
        });

        // Adjust active step if needed
        if (activeStep > newSteps.length) {
            setActiveStep(newSteps.length);
        }
    };

    const renameStep = (stepIndex: number, newLabel: string) => {
        if (!form) return;
        const newSteps = [...steps];
        newSteps[stepIndex] = { ...newSteps[stepIndex], label: newLabel };
        setForm({
            ...form,
            settings: { ...form.settings, steps: newSteps }
        });
    };

    const addField = (type: string) => {
        if (!form) return;
        const newField: Field = {
            label: type === 'payment_section' ? 'Payment Details' : type === 'file' ? 'Upload File' : 'New Question',
            field_type: type,
            is_required: false,
            placeholder: '',
            mapping_field: null,
            options: type === 'select' || type === 'radio' ? ['Option 1', 'Option 2'] : undefined,
            use_separator: false,
            step_number: activeStep
        };
        setForm({ ...form, fields: [...form.fields, newField] });
    };

    const updateField = (index: number, updates: Partial<Field>) => {
        if (!form) return;
        const newFields = [...form.fields];
        newFields[index] = { ...newFields[index], ...updates };
        setForm({ ...form, fields: newFields });
    };

    const removeField = (index: number) => {
        if (!form) return;
        const newFields = form.fields.filter((_, i) => i !== index);
        setForm({ ...form, fields: newFields });
    };

    const moveField = (index: number, direction: 'up' | 'down') => {
        if (!form) return;
        const currentStepFields = form.fields.filter(f => f.step_number === activeStep);
        const otherFields = form.fields.filter(f => f.step_number !== activeStep);

        const fieldIndexInStep = currentStepFields.findIndex((_, i) => {
            const globalIndex = form.fields.findIndex(f => f === currentStepFields[i]);
            return globalIndex === index;
        });

        if (direction === 'up' && fieldIndexInStep > 0) {
            [currentStepFields[fieldIndexInStep], currentStepFields[fieldIndexInStep - 1]] =
                [currentStepFields[fieldIndexInStep - 1], currentStepFields[fieldIndexInStep]];
        } else if (direction === 'down' && fieldIndexInStep < currentStepFields.length - 1) {
            [currentStepFields[fieldIndexInStep], currentStepFields[fieldIndexInStep + 1]] =
                [currentStepFields[fieldIndexInStep + 1], currentStepFields[fieldIndexInStep]];
        }

        // Rebuild maintaining order by step
        const allFields: Field[] = [];
        for (let i = 1; i <= steps.length; i++) {
            if (i === activeStep) {
                allFields.push(...currentStepFields);
            } else {
                allFields.push(...form.fields.filter(f => f.step_number === i));
            }
        }

        setForm({ ...form, fields: allFields });
    };

    const getFieldsForStep = (stepNumber: number) => {
        return form?.fields.filter(f => f.step_number === stepNumber) || [];
    };

    const getGlobalFieldIndex = (field: Field) => {
        return form?.fields.findIndex(f => f === field) ?? -1;
    };

    if (loading) return <div className="p-8 text-center">Loading...</div>;
    if (!form) return <div className="p-8 text-center">Form not found</div>;

    const currentStepFields = getFieldsForStep(activeStep);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col h-screen overflow-hidden">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                    <Link href="/forms" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">{form.title}</h1>
                        <p className="text-xs text-gray-500">Form Builder • {steps.length} Step{steps.length !== 1 ? 's' : ''}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <a
                        href={`/f/${id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                    >
                        <Eye size={16} />
                        Preview
                    </a>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-sm font-medium disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : success ? 'Saved!' : 'Save Changes'}
                        {!saving && !success && <Save size={18} />}
                        {success && <CheckCircle2 size={18} />}
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-hidden flex">
                {/* Left Sidebar: Steps */}
                <div className="w-56 bg-white border-r border-gray-200 p-4 flex flex-col gap-4 shrink-0 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Steps</h3>
                        <button
                            onClick={addStep}
                            className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            title="Add Step"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    <div className="space-y-2">
                        {steps.map((step, index) => (
                            <div
                                key={index}
                                className={`relative group rounded-xl border-2 transition-all cursor-pointer ${activeStep === index + 1
                                    ? 'border-teal-500 bg-teal-50'
                                    : 'border-gray-100 hover:border-gray-200 bg-white'
                                    }`}
                            >
                                <div
                                    className="p-3 flex items-center gap-2"
                                    onClick={() => setActiveStep(index + 1)}
                                >
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${activeStep === index + 1
                                        ? 'bg-teal-600 text-white'
                                        : 'bg-gray-200 text-gray-600'
                                        }`}>
                                        {index + 1}
                                    </div>
                                    {editingStepIndex === index ? (
                                        <input
                                            type="text"
                                            value={step.label}
                                            onChange={e => renameStep(index, e.target.value)}
                                            onBlur={() => setEditingStepIndex(null)}
                                            onKeyDown={e => e.key === 'Enter' && setEditingStepIndex(null)}
                                            autoFocus
                                            className="flex-1 text-sm font-medium bg-transparent border-b border-teal-500 outline-none"
                                        />
                                    ) : (
                                        <span className="flex-1 text-sm font-medium text-gray-700 truncate">
                                            {step.label}
                                        </span>
                                    )}
                                </div>

                                {/* Step Actions */}
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setEditingStepIndex(index); }}
                                        className="p-1 text-gray-400 hover:text-teal-600"
                                    >
                                        <Pencil size={12} />
                                    </button>
                                    {steps.length > 1 && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeStep(index); }}
                                            className="p-1 text-gray-400 hover:text-red-500"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>

                                {/* Field count badge */}
                                <div className="absolute -right-1 -top-1 w-5 h-5 bg-gray-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                    {getFieldsForStep(index + 1).length}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Step tip */}
                    <div className="mt-auto p-3 bg-gray-50 rounded-xl text-xs text-gray-500">
                        <Layers size={14} className="inline mr-1" />
                        Fields added will go to the active step.
                    </div>
                </div>

                {/* Main Content: Form Preview / Editor */}
                <div className="flex-1 overflow-y-auto p-8 relative">
                    <div className="max-w-2xl mx-auto space-y-6">
                        {/* Form Settings Card */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                            <div className="flex items-center gap-2 mb-2 text-gray-400 uppercase text-xs font-bold tracking-wider">
                                <Settings size={14} />
                                General Settings
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Form Title</label>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                    value={form.description || ''}
                                    onChange={e => setForm({ ...form, description: e.target.value })}
                                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all resize-none h-20"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Pipeline Stage</label>
                                    <select
                                        value={form.pipeline_stage_id || ''}
                                        onChange={e => setForm({ ...form, pipeline_stage_id: e.target.value })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                    >
                                        <option value="">Select a stage...</option>
                                        {stages.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Messenger Redirect</label>
                                    <select
                                        value={form.page_id || ''}
                                        onChange={e => setForm({ ...form, page_id: e.target.value || null })}
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                                    >
                                        <option value="">No redirect</option>
                                        {pages.map(p => (
                                            <option key={p.page_id} value={p.page_id}>{p.page_name}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-1">Redirect to Messenger after submit</p>
                                </div>
                            </div>

                            {/* Payment instructions if has payment field */}
                            {form.fields.some(f => f.field_type === 'payment_section') && (
                                <div className="pt-4 border-t border-gray-100">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Instructions</label>
                                    <textarea
                                        value={form.settings?.payment_instructions || ''}
                                        onChange={e => setForm({
                                            ...form,
                                            settings: { ...form.settings, payment_instructions: e.target.value }
                                        })}
                                        placeholder="e.g., GCash: 09XX-XXX-XXXX (Juan Dela Cruz)&#10;Bank: BPI SA 1234-5678-90"
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none transition-all resize-none h-24 text-sm"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Will be shown in the payment section</p>
                                </div>
                            )}
                        </div>

                        {/* Current Step Header */}
                        <div className="flex items-center gap-2 text-teal-600">
                            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center font-bold text-sm">
                                {activeStep}
                            </div>
                            <h2 className="text-lg font-bold">{steps[activeStep - 1]?.label || `Step ${activeStep}`}</h2>
                            <ChevronRight size={16} className="text-gray-300" />
                            <span className="text-sm text-gray-400">{currentStepFields.length} field{currentStepFields.length !== 1 ? 's' : ''}</span>
                        </div>

                        {/* Fields List for Current Step */}
                        <div className="space-y-4">
                            {currentStepFields.map((field) => {
                                const globalIndex = getGlobalFieldIndex(field);
                                return (
                                    <div key={globalIndex} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:border-teal-500/30 transition-all group relative">
                                        {/* Field Type Badge */}
                                        <div className="absolute left-4 top-4 flex items-center gap-1.5">
                                            {field.field_type === 'file' && <Upload size={14} className="text-purple-500" />}
                                            {field.field_type === 'payment_section' && <CreditCard size={14} className="text-amber-500" />}
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                {field.field_type.replace('_', ' ')}
                                            </span>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="absolute right-4 top-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => moveField(globalIndex, 'up')} disabled={currentStepFields.indexOf(field) === 0} className="p-1 text-gray-400 hover:text-teal-600 disabled:opacity-30">▲</button>
                                            <button onClick={() => moveField(globalIndex, 'down')} disabled={currentStepFields.indexOf(field) === currentStepFields.length - 1} className="p-1 text-gray-400 hover:text-teal-600 disabled:opacity-30">▼</button>
                                            <button onClick={() => removeField(globalIndex)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                                        </div>

                                        <div className="space-y-4 pr-8 pt-6">
                                            <div className="flex gap-4">
                                                <div className="flex-1">
                                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Question Label</label>
                                                    <input
                                                        type="text"
                                                        value={field.label}
                                                        onChange={e => updateField(globalIndex, { label: e.target.value })}
                                                        className="w-full px-3 py-2 bg-gray-50 border-b-2 border-transparent focus:border-teal-500 outline-none font-medium text-gray-900 placeholder-gray-400 transition-colors"
                                                        placeholder="Enter question..."
                                                    />
                                                </div>
                                            </div>

                                            {/* Show placeholder for non-special fields */}
                                            {!['payment_section', 'file'].includes(field.field_type) && (
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Placeholder</label>
                                                        <input
                                                            type="text"
                                                            value={field.placeholder || ''}
                                                            onChange={e => updateField(globalIndex, { placeholder: e.target.value })}
                                                            className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-teal-500 outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 block">Map to Lead Field</label>
                                                        <select
                                                            value={field.mapping_field || ''}
                                                            onChange={e => updateField(globalIndex, { mapping_field: e.target.value || null })}
                                                            className="w-full px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-teal-500 outline-none"
                                                        >
                                                            <option value="">None (Custom Data)</option>
                                                            <option value="name">Full Name</option>
                                                            <option value="email">Email Address</option>
                                                            <option value="phone">Phone Number</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            )}

                                            {/* File upload hint */}
                                            {field.field_type === 'file' && (
                                                <div className="p-3 bg-purple-50 rounded-xl text-sm text-purple-700 border border-purple-100">
                                                    <Upload size={14} className="inline mr-2" />
                                                    Users can upload images (JPG, PNG) up to 5MB
                                                </div>
                                            )}

                                            {/* Payment section hint */}
                                            {field.field_type === 'payment_section' && (
                                                <div className="p-3 bg-amber-50 rounded-xl text-sm text-amber-700 border border-amber-100">
                                                    <CreditCard size={14} className="inline mr-2" />
                                                    Displays payment instructions + file upload for receipt
                                                </div>
                                            )}

                                            <div className="flex items-center gap-2 mt-2">
                                                <input
                                                    type="checkbox"
                                                    id={`req-${globalIndex}`}
                                                    checked={field.is_required}
                                                    onChange={e => updateField(globalIndex, { is_required: e.target.checked })}
                                                    className="rounded text-teal-600 focus:ring-teal-500"
                                                />
                                                <label htmlFor={`req-${globalIndex}`} className="text-sm text-gray-600 select-none cursor-pointer">Required</label>
                                            </div>

                                            {field.field_type === 'number' && (
                                                <div className="flex items-center gap-2 mt-2">
                                                    <input
                                                        type="checkbox"
                                                        id={`sep-${globalIndex}`}
                                                        checked={field.use_separator || false}
                                                        onChange={e => updateField(globalIndex, { use_separator: e.target.checked })}
                                                        className="rounded text-teal-600 focus:ring-teal-500"
                                                    />
                                                    <label htmlFor={`sep-${globalIndex}`} className="text-sm text-gray-600 select-none cursor-pointer">Use Number Separator</label>
                                                </div>
                                            )}

                                            {(field.field_type === 'select' || field.field_type === 'radio') && (
                                                <div className="mt-2 bg-gray-50 p-3 rounded-xl border border-dashed border-gray-300">
                                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Options (comma separated)</label>
                                                    <input
                                                        type="text"
                                                        value={field.options?.join(', ') || ''}
                                                        onChange={e => updateField(globalIndex, { options: e.target.value.split(',').map(s => s.trim()) })}
                                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-teal-500 outline-none"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {currentStepFields.length === 0 && (
                                <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
                                    No fields in this step yet. Add one from the sidebar.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Sidebar: Tools */}
                <div className="w-64 bg-white border-l border-gray-200 p-6 flex flex-col gap-6 shrink-0 z-10 overflow-y-auto">
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Add Field</h3>
                        <div className="grid grid-cols-1 gap-2">
                            {[
                                { type: 'text', label: 'Short Text' },
                                { type: 'textarea', label: 'Long Text' },
                                { type: 'email', label: 'Email' },
                                { type: 'phone', label: 'Phone' },
                                { type: 'number', label: 'Number' },
                                { type: 'select', label: 'Dropdown' },
                                { type: 'radio', label: 'Multiple Choice' },
                                { type: 'checkbox', label: 'Checkbox' },
                            ].map(item => (
                                <button
                                    key={item.type}
                                    onClick={() => addField(item.type)}
                                    className="flex items-center gap-2 p-2.5 text-left bg-gray-50 hover:bg-teal-50 hover:text-teal-700 text-gray-600 rounded-lg transition-colors text-sm font-medium border border-gray-100 hover:border-teal-200"
                                >
                                    <Plus size={14} />
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Special Fields */}
                    <div className="pt-4 border-t border-gray-100">
                        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Special Fields</h3>
                        <div className="grid grid-cols-1 gap-2">
                            <button
                                onClick={() => addField('file')}
                                className="flex items-center gap-2 p-2.5 text-left bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors text-sm font-medium border border-purple-100 hover:border-purple-200"
                            >
                                <Upload size={14} />
                                File Upload
                            </button>
                            <button
                                onClick={() => addField('payment_section')}
                                className="flex items-center gap-2 p-2.5 text-left bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors text-sm font-medium border border-amber-100 hover:border-amber-200"
                            >
                                <CreditCard size={14} />
                                Payment Section
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
