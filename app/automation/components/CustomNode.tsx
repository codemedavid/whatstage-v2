'use client';

import { Handle, Position, NodeProps } from '@xyflow/react';
import { Mail, MessageSquare, Zap, Clock, GitBranch, CircleOff, BrainCircuit } from 'lucide-react';
import { memo } from 'react';

const icons = {
    trigger: Zap,
    email: Mail,
    message: MessageSquare,
    wait: Clock,
    condition: GitBranch,
    stop_bot: CircleOff,
    smart_condition: BrainCircuit,
};

const CustomNode = ({ data, selected }: NodeProps) => {
    const Icon = icons[data.type as keyof typeof icons] || MessageSquare;

    const getColors = (type: string) => {
        switch (type) {
            case 'trigger': return 'bg-pink-100 text-pink-500';
            case 'wait': return 'bg-orange-100 text-orange-500';
            case 'stop_bot': return 'bg-red-100 text-red-500';
            case 'smart_condition': return 'bg-purple-100 text-purple-500';
            default: return 'bg-blue-50 text-blue-500';
        }
    };

    const isSmartCondition = data.type === 'smart_condition';

    return (
        <div className={`
      px-4 py-3 shadow-md rounded-xl bg-white border-2 w-64 ${isSmartCondition ? 'pb-8' : ''}
      ${selected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-100'}
      transition-all duration-200
    `}>
            <div className="flex items-center">
                <div className={`
          w-10 h-10 rounded-lg flex items-center justify-center mr-3
          ${getColors(data.type as string)}
        `}>
                    <Icon size={20} />
                </div>
                <div>
                    <div className="text-sm font-bold text-gray-900">{data.label as string}</div>
                    <div className="text-xs text-gray-500">{data.description as string}</div>
                </div>
            </div>

            <Handle type="target" position={Position.Top} className="!bg-gray-300 !w-3 !h-3" />

            {isSmartCondition ? (
                <>
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="true"
                        className="!bg-green-500 !w-3 !h-3"
                        style={{ left: '30%' }}
                    />
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="false"
                        className="!bg-red-500 !w-3 !h-3"
                        style={{ left: '70%' }}
                    />
                    <div className="absolute -bottom-5 left-[30%] -translate-x-1/2 text-[10px] font-semibold text-green-600">
                        True
                    </div>
                    <div className="absolute -bottom-5 left-[70%] -translate-x-1/2 text-[10px] font-semibold text-red-600">
                        False
                    </div>
                </>
            ) : (
                <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-3 !h-3" />
            )}
        </div>
    );
};

export default memo(CustomNode);
