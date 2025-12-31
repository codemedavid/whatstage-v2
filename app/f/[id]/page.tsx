'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, ChevronLeft, ChevronRight, Upload, CreditCard, X, Image as ImageIcon } from 'lucide-react';

interface Field {
    id: string;
    label: string;
    field_type: string;
    is_required: boolean;
    options?: string[];
    placeholder?: string;
    use_separator?: boolean;
    step_number: number;
}

interface Step {
    label: string;
}

interface Form {
    id: string;
    title: string;
    description: string;
    page_id: string | null;
    settings: {
        steps?: Step[];
        payment_instructions?: string;
        [key: string]: any;
    };
    fields: Field[];
}

export default function PublicFormPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const searchParams = useSearchParams();

    // Extract tracking parameters from URL
    const userId = searchParams.get('user_id') || searchParams.get('psid') || null;
    const pageIdFromUrl = searchParams.get('pageId') || null;

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [form, setForm] = useState<Form | null>(null);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [fileUploads, setFileUploads] = useState<Record<string, { url: string; name: string; preview?: string }>>({});
    const [uploadingField, setUploadingField] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [currentStep, setCurrentStep] = useState(1);

    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    // Get steps from form settings
    const steps: Step[] = form?.settings?.steps || [{ label: 'Step 1' }];
    const totalSteps = steps.length;

    useEffect(() => {
        const fetchForm = async () => {
            try {
                const res = await fetch(`/api/forms/${id}`);
                if (!res.ok) throw new Error('Form not found or unavailable');
                const data = await res.json();

                // Ensure fields have step_number
                if (data.fields) {
                    data.fields = data.fields.map((f: Field) => ({
                        ...f,
                        step_number: f.step_number || 1
                    }));
                }

                // Ensure settings has steps
                if (!data.settings) data.settings = {};
                if (!data.settings.steps) {
                    data.settings.steps = [{ label: 'Step 1' }];
                }

                setForm(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchForm();
    }, [id]);

    const getCurrentStepFields = () => {
        return form?.fields.filter(f => f.step_number === currentStep) || [];
    };

    const validateCurrentStep = () => {
        const currentFields = getCurrentStepFields();
        for (const field of currentFields) {
            if (field.is_required) {
                if (field.field_type === 'file' || field.field_type === 'payment_section') {
                    // For payment section, check if file is uploaded
                    if (field.field_type === 'payment_section' && !fileUploads[`${field.id}_receipt`]) {
                        setError(`Please upload a payment receipt for "${field.label}"`);
                        return false;
                    }
                    if (field.field_type === 'file' && !fileUploads[field.id]) {
                        setError(`Please upload a file for "${field.label}"`);
                        return false;
                    }
                } else if (!formData[field.id]) {
                    setError(`Please fill in "${field.label}"`);
                    return false;
                }
            }
        }
        setError('');
        return true;
    };

    const handleNext = () => {
        if (validateCurrentStep() && currentStep < totalSteps) {
            setCurrentStep(currentStep + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1);
            setError('');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleFileUpload = async (fieldId: string, file: File) => {
        setUploadingField(fieldId);
        setError('');

        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('field_id', fieldId);

            const res = await fetch('/api/forms/upload', {
                method: 'POST',
                body: fd
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Upload failed');
            }

            const data = await res.json();

            // Create preview for images
            const preview = URL.createObjectURL(file);

            setFileUploads(prev => ({
                ...prev,
                [fieldId]: { url: data.url, name: file.name, preview }
            }));

        } catch (err: any) {
            setError(err.message);
        } finally {
            setUploadingField(null);
        }
    };

    const removeFile = (fieldId: string) => {
        setFileUploads(prev => {
            const newUploads = { ...prev };
            if (newUploads[fieldId]?.preview) {
                URL.revokeObjectURL(newUploads[fieldId].preview!);
            }
            delete newUploads[fieldId];
            return newUploads;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateCurrentStep()) return;

        setSubmitting(true);
        setError('');

        try {
            // Prepare submission data including file URLs
            const submissionData = { ...formData };
            Object.entries(fileUploads).forEach(([fieldId, fileInfo]) => {
                submissionData[fieldId] = fileInfo.url;
            });

            const res = await fetch('/api/forms/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    form_id: id,
                    user_id: userId,
                    data: Object.entries(submissionData).reduce((acc, [key, value]) => {
                        const field = form?.fields.find(f => f.id === key);
                        if (field?.field_type === 'number' && field?.use_separator && typeof value === 'string') {
                            acc[key] = value.replace(/,/g, '');
                        } else {
                            acc[key] = value;
                        }
                        return acc;
                    }, {} as Record<string, any>)
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Submission failed');
            }

            setSubmitted(true);

            // Redirect to Messenger after a delay
            // Priority: form.page_id > pageId from URL params
            const redirectPageId = form?.page_id || pageIdFromUrl;
            console.log('[Form Submit] Redirect check:', {
                formPageId: form?.page_id,
                urlPageId: pageIdFromUrl,
                willRedirect: !!redirectPageId
            });

            if (redirectPageId) {
                console.log('[Form Submit] Redirecting to Messenger:', `https://m.me/${redirectPageId}`);
                setTimeout(() => {
                    window.location.href = `https://m.me/${redirectPageId}`;
                }, 2000);
            } else {
                console.log('[Form Submit] No redirect - no page_id configured');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleChange = (fieldId: string, value: any) => {
        setFormData(prev => ({ ...prev, [fieldId]: value }));
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-teal-600" /></div>;
    }

    if (error && !form) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">{error}</div>;
    }

    if (submitted) {
        const redirectPageId = form?.page_id || pageIdFromUrl;
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white max-w-md w-full p-8 rounded-2xl shadow-lg text-center border border-gray-100">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h2>
                    <p className="text-gray-600 mb-4">Your submission has been received successfully.</p>
                    {redirectPageId && (
                        <p className="text-sm text-gray-500">Redirecting you back to Messenger...</p>
                    )}
                </div>
            </div>
        );
    }

    if (!form) return null;

    const currentFields = getCurrentStepFields();

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-xl mx-auto">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Form Header */}
                    <div className="bg-teal-600 p-6 text-white">
                        <h1 className="text-2xl font-bold mb-1">{form.title}</h1>
                        {form.description && (
                            <p className="text-teal-100 text-sm opacity-90">{form.description}</p>
                        )}
                    </div>

                    {/* Step Progress */}
                    {totalSteps > 1 && (
                        <div className="px-6 py-4 border-b border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    Step {currentStep} of {totalSteps}
                                </span>
                                <span className="text-sm font-medium text-teal-600">
                                    {steps[currentStep - 1]?.label}
                                </span>
                            </div>
                            <div className="flex gap-1">
                                {steps.map((_, index) => (
                                    <div
                                        key={index}
                                        className={`flex-1 h-1.5 rounded-full transition-colors ${index < currentStep ? 'bg-teal-500' : 'bg-gray-200'
                                            }`}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Form Body */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        {error && (
                            <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                                {error}
                            </div>
                        )}

                        {currentFields.map((field) => (
                            <div key={field.id} className="space-y-2">
                                <label className="block text-sm font-semibold text-gray-700">
                                    {field.label}
                                    {field.is_required && <span className="text-red-500 ml-1">*</span>}
                                </label>

                                {/* Payment Section */}
                                {field.field_type === 'payment_section' ? (
                                    <div className="space-y-4">
                                        {/* Payment Instructions */}
                                        {form.settings?.payment_instructions && (
                                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                                <div className="flex items-center gap-2 mb-2 text-amber-700 font-medium">
                                                    <CreditCard size={16} />
                                                    <span>Payment Instructions</span>
                                                </div>
                                                <div className="text-sm text-amber-800 whitespace-pre-wrap">
                                                    {form.settings.payment_instructions}
                                                </div>
                                            </div>
                                        )}

                                        {/* Receipt Upload */}
                                        <div className="space-y-2">
                                            <label className="block text-sm font-medium text-gray-600">
                                                Upload Payment Receipt
                                                {field.is_required && <span className="text-red-500 ml-1">*</span>}
                                            </label>

                                            {fileUploads[`${field.id}_receipt`] ? (
                                                <div className="relative">
                                                    <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                                                        {fileUploads[`${field.id}_receipt`].preview && (
                                                            <img
                                                                src={fileUploads[`${field.id}_receipt`].preview}
                                                                alt="Receipt"
                                                                className="w-16 h-16 object-cover rounded-lg"
                                                            />
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-green-700 truncate">
                                                                {fileUploads[`${field.id}_receipt`].name}
                                                            </p>
                                                            <p className="text-xs text-green-600">Uploaded successfully</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeFile(`${field.id}_receipt`)}
                                                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div
                                                    onClick={() => fileInputRefs.current[`${field.id}_receipt`]?.click()}
                                                    className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/50 transition-all"
                                                >
                                                    {uploadingField === `${field.id}_receipt` ? (
                                                        <Loader2 className="w-8 h-8 mx-auto text-teal-500 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <ImageIcon className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                                                            <p className="text-sm font-medium text-gray-600">Click to upload receipt</p>
                                                            <p className="text-xs text-gray-400 mt-1">JPG, PNG up to 5MB</p>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                            <input
                                                type="file"
                                                ref={el => { fileInputRefs.current[`${field.id}_receipt`] = el; }}
                                                accept="image/jpeg,image/png,image/gif,image/webp"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) handleFileUpload(`${field.id}_receipt`, file);
                                                }}
                                                className="hidden"
                                            />
                                        </div>
                                    </div>
                                ) : field.field_type === 'file' ? (
                                    /* File Upload Field */
                                    <div>
                                        {fileUploads[field.id] ? (
                                            <div className="relative">
                                                <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                                                    {fileUploads[field.id].preview && (
                                                        <img
                                                            src={fileUploads[field.id].preview}
                                                            alt="Upload"
                                                            className="w-16 h-16 object-cover rounded-lg"
                                                        />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-green-700 truncate">
                                                            {fileUploads[field.id].name}
                                                        </p>
                                                        <p className="text-xs text-green-600">Uploaded successfully</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFile(field.id)}
                                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                onClick={() => fileInputRefs.current[field.id]?.click()}
                                                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/50 transition-all"
                                            >
                                                {uploadingField === field.id ? (
                                                    <Loader2 className="w-8 h-8 mx-auto text-teal-500 animate-spin" />
                                                ) : (
                                                    <>
                                                        <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                                                        <p className="text-sm font-medium text-gray-600">Click to upload</p>
                                                        <p className="text-xs text-gray-400 mt-1">JPG, PNG up to 5MB</p>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            ref={el => { fileInputRefs.current[field.id] = el; }}
                                            accept="image/jpeg,image/png,image/gif,image/webp"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleFileUpload(field.id, file);
                                            }}
                                            className="hidden"
                                        />
                                    </div>
                                ) : field.field_type === 'textarea' ? (
                                    <textarea
                                        required={field.is_required}
                                        placeholder={field.placeholder}
                                        onChange={e => handleChange(field.id, e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all resize-y min-h-[100px]"
                                    />
                                ) : field.field_type === 'select' ? (
                                    <select
                                        required={field.is_required}
                                        onChange={e => handleChange(field.id, e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all bg-white"
                                        defaultValue=""
                                    >
                                        <option value="" disabled>Select an option...</option>
                                        {field.options?.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                ) : field.field_type === 'radio' ? (
                                    <div className="space-y-2 pt-1">
                                        {field.options?.map(opt => (
                                            <label key={opt} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                                                <input
                                                    type="radio"
                                                    name={field.id}
                                                    value={opt}
                                                    required={field.is_required}
                                                    onChange={e => handleChange(field.id, e.target.value)}
                                                    className="w-4 h-4 text-teal-600 focus:ring-teal-500 border-gray-300"
                                                />
                                                <span className="text-gray-700 font-medium">{opt}</span>
                                            </label>
                                        ))}
                                    </div>
                                ) : field.field_type === 'number' && field.use_separator ? (
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        required={field.is_required}
                                        placeholder={field.placeholder}
                                        value={formData[field.id] || ''}
                                        onChange={e => {
                                            let raw = e.target.value.replace(/[^0-9.]/g, '');
                                            const parts = raw.split('.');
                                            if (parts.length > 2) {
                                                raw = parts[0] + '.' + parts.slice(1).join('');
                                            }
                                            const integerPart = parts[0];
                                            const decimalPart = parts.length > 1 ? '.' + parts[1] : '';
                                            const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                                            handleChange(field.id, formattedInteger + decimalPart);
                                        }}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                                    />
                                ) : field.field_type === 'checkbox' ? (
                                    <div className="flex items-center gap-3 pt-1">
                                        <input
                                            type="checkbox"
                                            id={field.id}
                                            required={field.is_required}
                                            onChange={e => handleChange(field.id, e.target.checked)}
                                            className="w-5 h-5 rounded text-teal-600 focus:ring-teal-500 border-gray-300"
                                        />
                                        <label htmlFor={field.id} className="text-gray-700 cursor-pointer select-none">
                                            {field.placeholder || 'I agree'}
                                        </label>
                                    </div>
                                ) : (
                                    <input
                                        type={field.field_type === 'phone' ? 'tel' : field.field_type}
                                        required={field.is_required}
                                        placeholder={field.placeholder}
                                        onChange={e => handleChange(field.id, e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                                    />
                                )}
                            </div>
                        ))}

                        {/* Navigation Buttons */}
                        <div className="pt-4 flex gap-3">
                            {currentStep > 1 && (
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    className="flex-1 py-3.5 px-6 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                                >
                                    <ChevronLeft size={18} />
                                    Back
                                </button>
                            )}

                            {currentStep < totalSteps ? (
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    className="flex-1 py-3.5 px-6 text-white bg-teal-600 hover:bg-teal-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                                >
                                    Next
                                    <ChevronRight size={18} />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="flex-1 py-3.5 px-6 text-white bg-teal-600 hover:bg-teal-700 rounded-xl font-bold text-lg shadow-md hover:shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        'Submit'
                                    )}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
