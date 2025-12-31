"use client";

import { useState, useEffect, useCallback } from 'react';
import RealEstateMetricsCards from './RealEstateMetricsCards';
import LeadPipelineOverview from './LeadPipelineOverview';
import ClosureInsightsCard from './ClosureInsights';
import UpcomingViewings from './UpcomingViewings';
import HumanTakeoverCard from '../HumanTakeoverCard';
import type { DashboardStatus, FlaggedLead, RealEstateMetrics } from '@/app/lib/dashboardData';

interface RealEstateDashboardProps {
    initialMetrics?: RealEstateMetrics | null;
    initialStatus: DashboardStatus | null;
    initialFlaggedLeads: FlaggedLead[];
    initialActiveSessions: Record<string, number>;
    onLeadClick?: (leadId: string, leadData: any) => void;
}

export default function RealEstateDashboard({
    initialMetrics,
    initialStatus,
    initialFlaggedLeads,
    initialActiveSessions,
    onLeadClick
}: RealEstateDashboardProps) {
    const [metrics, setMetrics] = useState<RealEstateMetrics | null>(initialMetrics || null);
    const [flaggedLeads, setFlaggedLeads] = useState<FlaggedLead[]>(initialFlaggedLeads);
    const [activeSessions, setActiveSessions] = useState(initialActiveSessions);
    const [isLoading, setIsLoading] = useState(!initialMetrics);

    // Fetch real estate metrics
    const refreshMetrics = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/dashboard/real-estate');
            if (res.ok) {
                const data = await res.json();
                setMetrics(data);
            }
        } catch (error) {
            console.error('Error fetching real estate metrics:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial fetch if no initial metrics provided
    useEffect(() => {
        if (!initialMetrics) {
            refreshMetrics();
        }
    }, [initialMetrics, refreshMetrics]);

    // Poll for updates every 60 seconds
    useEffect(() => {
        const interval = setInterval(refreshMetrics, 60000);
        return () => clearInterval(interval);
    }, [refreshMetrics]);

    const handleTakeoverRefresh = async () => {
        try {
            const [leadsRes, sessionsRes] = await Promise.all([
                fetch('/api/leads/needs-attention'),
                fetch('/api/leads/active-sessions'),
            ]);
            if (leadsRes.ok) {
                const data = await leadsRes.json();
                setFlaggedLeads(data.leads || []);
            }
            if (sessionsRes.ok) {
                const data = await sessionsRes.json();
                setActiveSessions(data.activeSessions || {});
            }
        } catch (error) {
            console.error('Error refreshing takeover data:', error);
        }
    };

    return (
        <div className="min-h-screen pb-10">
            {/* Top Row: Key Metrics */}
            <RealEstateMetricsCards metrics={metrics || undefined} isLoading={isLoading} />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                {/* Lead Pipeline - Takes up 1 column */}
                <div className="h-full">
                    <LeadPipelineOverview
                        pipeline={metrics?.pipeline}
                        isLoading={isLoading}
                    />
                </div>

                {/* Closure Insights - Takes up 1 column */}
                <div className="h-full">
                    <ClosureInsightsCard
                        insights={metrics?.closureInsights}
                    />
                </div>

                {/* Upcoming Viewings - Takes up 1 column */}
                <div className="h-full">
                    <UpcomingViewings
                        viewings={metrics?.viewings?.upcoming}
                    />
                </div>
            </div>

            {/* Bottom Section: Human Takeover */}
            <div className="grid grid-cols-12 gap-6">
                <div className="col-span-12">
                    <HumanTakeoverCard
                        onLeadClick={onLeadClick}
                        initialLeads={flaggedLeads}
                        initialSessions={activeSessions}
                        onRefresh={handleTakeoverRefresh}
                        onUpdateLeads={setFlaggedLeads}
                        onUpdateSessions={setActiveSessions}
                    />
                </div>
            </div>
        </div>
    );
}
